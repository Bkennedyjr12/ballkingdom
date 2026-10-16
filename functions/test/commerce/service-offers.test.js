import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
  STRATEGY_SESSION_SKU,STRATEGY_SESSION_QBO_ITEM_SPEC,getServiceOffer,taxGatePassed,
  isAllowedBookingUrl,getPostPaymentBookingUrl,assertServiceItemReadback,
} from '../../src/commerce/service-offers.js';
import {
  getConfiguredCommerceItem,getConfiguredPaymentsCapability,isPublicCommerceActivationReady,
  isCommerceItemPurchasable,applyRuntimeItemVerification,clearRuntimeItemVerifications,listPublicCommerceItems,
} from '../../src/commerce/catalog.js';
import {newOrder} from '../../src/commerce/order-state.js';
import {createQuickBooksClient} from '../../src/providers/quickbooks.js';

const offer = getServiceOffer(STRATEGY_SESSION_SKU);
const liveFlags = {publicAuthResumeEnabled:true,publicDigitalCheckoutEnabled:true,controlledOwnerPilotEnabled:false,serviceQboSendEnabled:false};
const ready = item => isPublicCommerceActivationReady({flags:liveFlags,capability:getConfiguredPaymentsCapability(),item,fulfillmentAvailable:true});
const verification = {verified:true,itemId:'42',itemName:STRATEGY_SESSION_QBO_ITEM_SPEC.name};

test('strategy session is $100 USD, active, deploy-approved, tax owner-approved pending accountant', () => {
  assert.equal(offer.amountCents, 10000);
  assert.equal(offer.active, true);
  assert.equal(offer.release.deployApproved, true);
  assert.equal(offer.tax.accountantVerified, false);
  assert.equal(offer.tax.ownerApproved, true);
  assert.equal(offer.tax.quickBooksTaxCode, 'NON');
  assert.equal(STRATEGY_SESSION_QBO_ITEM_SPEC.unitPrice, 100);
  assert.equal(STRATEGY_SESSION_QBO_ITEM_SPEC.taxable, false);
  assert.throws(() => { offer.active = false; });
});

test('runtime refuses the session while the QuickBooks item is unverified', () => {
  clearRuntimeItemVerifications();
  const item = getConfiguredCommerceItem(STRATEGY_SESSION_SKU);
  assert.equal(item.quickBooks.itemVerified, false);
  assert.equal(isCommerceItemPurchasable(item), false);
  assert.equal(ready(item), false);
  assert.deepEqual(listPublicCommerceItems(), []);
});

test('a verified readback opens the session without a deploy; bad readbacks never do', () => {
  clearRuntimeItemVerifications();
  for (const bad of [{...verification,verified:false},{...verification,itemId:'abc'},{...verification,itemName:'Other'},null]) {
    assert.equal(applyRuntimeItemVerification(STRATEGY_SESSION_SKU, bad), false);
    assert.equal(ready(getConfiguredCommerceItem(STRATEGY_SESSION_SKU)), false);
  }
  assert.equal(applyRuntimeItemVerification(STRATEGY_SESSION_SKU, verification), true);
  const item = getConfiguredCommerceItem(STRATEGY_SESSION_SKU);
  assert.equal(item.quickBooks.itemId, '42');
  assert.equal(ready(item), true);
  assert.equal(ready(item) && ready({...item}) , true);
  const order = newOrder({item,customer:{name:'Buyer'}});
  assert.equal(order.accountingSnapshot.itemId, '42');
  assert.equal(order.accountingSnapshot.taxCode, 'NON');
  assert.equal(order.amountCents, 10000);
  clearRuntimeItemVerifications();
});

test('Study Guide stays closed with public flags on, and cannot use runtime verification', () => {
  const guide = getConfiguredCommerceItem('home-inspection-study-guide');
  assert.equal(guide.active, false);
  assert.equal(guide.release.deployApproved, false);
  assert.equal(ready(guide), false);
  assert.equal(applyRuntimeItemVerification('home-inspection-study-guide', {...verification,itemName:'Home Inspection Study Guide'}), false);
  applyRuntimeItemVerification(STRATEGY_SESSION_SKU, verification);
  assert.deepEqual(listPublicCommerceItems().map(item => item.sku), [STRATEGY_SESSION_SKU]);
  clearRuntimeItemVerifications();
});

test('committed env enables only public flags; owner pilot and service send stay off', () => {
  const env = Object.fromEntries(readFileSync(new URL('../../.env.the-ballers-kingdom', import.meta.url),'utf8')
    .split('\n').filter(line => line.startsWith('COMMERCE_')).map(line => line.split('=')));
  assert.deepEqual(env, {
    COMMERCE_PUBLIC_AUTH_RESUME_ENABLED:'true',COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED:'true',
    COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED:'false',COMMERCE_SERVICE_QBO_SEND_ENABLED:'false',
  });
});

test('tax gate: services may pass pending accountant review; downloads still require accountant', () => {
  assert.equal(taxGatePassed(offer), true);
  assert.equal(taxGatePassed({...offer,tax:{...offer.tax,ownerApproved:false}}), false);
  assert.equal(taxGatePassed({...offer,tax:{...offer.tax,reviewStatus:'none'}}), false);
  const guide = getConfiguredCommerceItem('home-inspection-study-guide');
  assert.equal(taxGatePassed({...guide,tax:{...guide.tax,accountantVerified:false,ownerApproved:true,reviewStatus:'pending_accountant_review'}}), false);
  assert.equal(taxGatePassed({...offer,offerKind:'digital',tax:{...offer.tax}}), false);
});

test('booking URL allowlist', () => {
  assert.equal(isAllowedBookingUrl('https://calendly.com/ballerskingdom/30min'), true);
  assert.equal(isAllowedBookingUrl('http://calendly.com/ballerskingdom/30min'), false);
  assert.equal(isAllowedBookingUrl('https://calendly.com/someoneelse/30min'), false);
  assert.equal(isAllowedBookingUrl('https://calendly.com.evil.io/ballerskingdom/30min'), false);
  assert.equal(isAllowedBookingUrl('javascript:alert(1)'), false);
});

test('booking link is released only for fulfilled (payment-verified) booking orders', () => {
  const base = {sku:STRATEGY_SESSION_SKU, fulfillmentType:'post_payment_booking'};
  for (const status of ['pending_payment','invoiced','payment_verifying','paid','cancelled','manual_review']) {
    assert.equal(getPostPaymentBookingUrl({...base, status}), null);
  }
  assert.equal(getPostPaymentBookingUrl({...base, status:'fulfilled'}), 'https://calendly.com/ballerskingdom/30min');
  assert.equal(getPostPaymentBookingUrl({...base, fulfillmentType:'protected_download', status:'fulfilled'}), null);
});

const good = {itemId:'42', name:STRATEGY_SESSION_QBO_ITEM_SPEC.name, type:'Service', active:true, unitPrice:100, incomeAccountName:'Services', taxable:false};
test('item readback assertion', () => {
  assert.equal(assertServiceItemReadback(good), good);
  for (const bad of [{unitPrice:97},{type:'NonInventory'},{incomeAccountName:'Sales'},{taxable:true},{active:false},{name:'x'}]) {
    assert.throws(() => assertServiceItemReadback({...good, ...bad}), {code:'QBO_ITEM_MISMATCH'});
  }
});

function json(body) { return new Response(JSON.stringify(body), {status:200, headers:{'content-type':'application/json'}}); }
function client(steps) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => { calls.push({url:String(url), init}); const s = steps.shift(); assert.ok(s, `unexpected ${url}`); return s(); };
  return {calls, c:createQuickBooksClient({realmId:'realm-7', accessTokenProvider:{getAccessToken:async()=>'t'}}, fetchImpl)};
}
const itemBody = {Item:{Id:'42', Name:STRATEGY_SESSION_QBO_ITEM_SPEC.name, Type:'Service', Active:true, UnitPrice:100, Taxable:false, IncomeAccountRef:{value:'26', name:'Services'}}};

test('ensureServiceItem reads back an existing item without creating', async () => {
  const {calls, c} = client([() => json({QueryResponse:{Item:[{Id:'42'}]}}), () => json(itemBody)]);
  const r = await c.ensureServiceItem(STRATEGY_SESSION_QBO_ITEM_SPEC);
  assert.equal(r.created, false);
  assertServiceItemReadback(r);
  assert.ok(calls.every(x => (x.init.method ?? 'GET') === 'GET'));
});

test('ensureServiceItem creates once with Services account then reads back', async () => {
  const {calls, c} = client([
    () => json({QueryResponse:{}}),
    () => json({QueryResponse:{Account:[{Id:'26', Name:'Services'}]}}),
    () => json({Item:{Id:'42'}}),
    () => json(itemBody),
  ]);
  const r = await c.ensureServiceItem(STRATEGY_SESSION_QBO_ITEM_SPEC);
  assert.equal(r.created, true);
  assertServiceItemReadback(r);
  const post = calls[2];
  assert.equal(post.init.method, 'POST');
  assert.match(post.url, /\/item\?minorversion=\d+&requestid=/);
  const body = JSON.parse(post.init.body);
  assert.deepEqual([body.Type, body.UnitPrice, body.Taxable, body.IncomeAccountRef.value], ['Service', 100, false, '26']);
});

test('ensureServiceItem refuses ambiguous names or accounts', async () => {
  await assert.rejects(client([() => json({QueryResponse:{Item:[{Id:'1'},{Id:'2'}]}})]).c.ensureServiceItem(STRATEGY_SESSION_QBO_ITEM_SPEC), /manual review/);
  await assert.rejects(client([() => json({QueryResponse:{}}), () => json({QueryResponse:{}})]).c.ensureServiceItem(STRATEGY_SESSION_QBO_ITEM_SPEC), /income account/);
});

import {buildPilotActionCodeSettings} from '../../src/commerce/commerce-service.js';
test('sign-in links return to the page for the requested SKU only', () => {
  assert.equal(buildPilotActionCodeSettings().url, 'https://ballkingdom.com/order-status.html?sku=home-inspection-study-guide');
  assert.equal(buildPilotActionCodeSettings(null, undefined, STRATEGY_SESSION_SKU).url, 'https://ballkingdom.com/strategy-session?sku=strategy-session-30');
  assert.equal(buildPilotActionCodeSettings('order-1', undefined, STRATEGY_SESSION_SKU).url, 'https://ballkingdom.com/strategy-session?sku=strategy-session-30&order=order-1');
  assert.equal(buildPilotActionCodeSettings(null, undefined, 'owner-admin').url, 'https://ballkingdom.com/admin-strategy-session?sku=owner-admin');
  assert.throws(() => buildPilotActionCodeSettings(null, undefined, 'https://evil.example'));
});

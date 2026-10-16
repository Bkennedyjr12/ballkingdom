import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STRATEGY_SESSION_SKU,STRATEGY_SESSION_QBO_ITEM_SPEC,getServiceOffer,isServiceOfferPurchasable,
  isAllowedBookingUrl,getPostPaymentBookingUrl,assertServiceItemReadback,
} from '../../src/commerce/service-offers.js';
import {createQuickBooksClient} from '../../src/providers/quickbooks.js';

const offer = getServiceOffer(STRATEGY_SESSION_SKU);

test('strategy session offer is $100 USD and fail-closed', () => {
  assert.equal(offer.tax.quickBooksTaxCode, 'NON');
  assert.equal(STRATEGY_SESSION_QBO_ITEM_SPEC.taxable, false);
  assert.equal(offer.amountCents, 10000);
  assert.equal(offer.currency, 'USD');
  assert.equal(offer.active, false);
  assert.equal(offer.release.deployApproved, false);
  assert.equal(offer.tax.accountantVerified, false);
  assert.equal(offer.quickBooks.itemVerified, false);
  assert.equal(isServiceOfferPurchasable(offer, {publicCheckoutEnabled:true}), false);
  assert.throws(() => { offer.active = true; });
});

test('offer becomes purchasable only when every gate is true', () => {
  const ready = structuredClone(offer);
  Object.assign(ready, {active:true});
  ready.release.deployApproved = true;
  ready.tax.accountantVerified = true;
  ready.quickBooks = {...ready.quickBooks, itemId:'42', itemVerified:true};
  assert.equal(isServiceOfferPurchasable(ready, {publicCheckoutEnabled:true}), true);
  assert.equal(isServiceOfferPurchasable(ready, {publicCheckoutEnabled:false}), false);
  assert.equal(isServiceOfferPurchasable({...ready, booking:{url:'https://evil.example/30min'}}, {publicCheckoutEnabled:true}), false);
});

test('booking URL allowlist', () => {
  assert.equal(isAllowedBookingUrl('https://calendly.com/ballerskingdom/30min'), true);
  assert.equal(isAllowedBookingUrl('http://calendly.com/ballerskingdom/30min'), false);
  assert.equal(isAllowedBookingUrl('https://calendly.com/someoneelse/30min'), false);
  assert.equal(isAllowedBookingUrl('https://calendly.com.evil.io/ballerskingdom/30min'), false);
  assert.equal(isAllowedBookingUrl('javascript:alert(1)'), false);
});

test('booking link is released only after verified payment', () => {
  const base = {sku:STRATEGY_SESSION_SKU, fulfillmentType:'post_payment_booking'};
  assert.equal(getPostPaymentBookingUrl({...base, status:'invoiced'}), null);
  assert.equal(getPostPaymentBookingUrl({...base, status:'paid'}), null);
  assert.equal(getPostPaymentBookingUrl({...base, status:'paid', payment:{verified:false}}), null);
  assert.equal(getPostPaymentBookingUrl({...base, status:'paid', payment:{verified:true}}), 'https://calendly.com/ballerskingdom/30min');
  assert.equal(getPostPaymentBookingUrl({...base, fulfillmentType:'protected_download', status:'paid', payment:{verified:true}}), null);
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

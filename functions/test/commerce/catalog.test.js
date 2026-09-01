import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCommerceItem,
  getConfiguredCommerceItem,
  getConfiguredPaymentsCapability,
  isCommerceItemPurchasable,
  listPublicCommerceItems,
  listCommerceCapabilities,
} from '../../src/commerce/catalog.js';

const verifiedPaymentsCapability=Object.freeze({
  accounting:true,
  payments:true,
  mode:'documented-intuit-flow',
  supportsImmediatePayment:true,
  supportsCards:true,
  supportsApplePay:true,
  supportsPayPal:true,
  supportsAch:true,
  supportsWebhooks:true,
  surchargingEnabled:false,
  onlineInvoiceDelivery:true,
});

test('keeps a known digital product unavailable before owner approval', () => {
  assert.throws(() => getCommerceItem('home-inspection-study-guide'), /unavailable/);
});

test('does not let a browser-supplied amount bypass inactivity', () => {
  assert.throws(
    () => getCommerceItem('home-inspection-study-guide', {amountCents: 1}),
    /unavailable/
  );
});

test('records the reviewed owner-pilot price, QuickBooks mapping, tax gate, and private artifact identity', () => {
  const item = getConfiguredCommerceItem('home-inspection-study-guide');
  assert.equal(item.amountCents, 4900);
  assert.equal(item.currency, 'USD');
  assert.equal(item.quickBooks.itemName, 'Home Inspection Study Guide');
  assert.equal(item.quickBooks.itemId, '8');
  assert.equal(item.quickBooks.itemVerified, true);
  assert.equal(item.tax.classification, 'electronic_only_non_taxable_owner_approved');
  assert.equal(item.tax.quickBooksTaxCode, 'NON');
  assert.equal(item.tax.accountantVerified, true);
  assert.equal(item.artifact.objectKey, 'private-commerce/home-inspection-study-guide/guide-v1.pdf');
  assert.equal(item.artifact.contentType, 'application/pdf');
  assert.equal(item.artifact.exactBytes, 71250419);
  assert.equal(item.artifact.sha256, '2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d');
  assert.equal(item.artifact.md5Hash, 'XXzfi6ddgB6rru9fLIrv7Q==');
  assert.equal(item.artifact.generation, '1788191152627469');
  assert.equal(item.artifact.objectVerified, true);
  assert.equal(item.release.deployApproved, false);
  assert.equal(Object.isFrozen(item), true);
  assert.equal(Object.isFrozen(item.artifact), true);
});

test('keeps the server-owned payment capability unverified for the inactive code deploy', () => {
  const capability=getConfiguredPaymentsCapability();
  assert.deepEqual(capability, {
    accounting:false,
    payments:false,
    mode:'documented-intuit-flow',
    supportsImmediatePayment:false,
    supportsCards:false,
    supportsApplePay:false,
    supportsPayPal:false,
    supportsAch:false,
    supportsWebhooks:false,
    surchargingEnabled:false,
    onlineInvoiceDelivery:false,
  });
  assert.equal(Object.isFrozen(capability), true);
});

test('records owner-approved nationwide electronic-only NON treatment', () => {
  const item = getConfiguredCommerceItem('home-inspection-study-guide');
  assert.equal(item.delivery, 'electronic_only');
  assert.equal(item.physicalCopyIncluded, false);
  assert.equal(item.tax.quickBooksTaxCode, 'NON');
  assert.equal(item.tax.accountantVerified, true);
  assert.equal(item.tax.geographicRestriction, 'none_owner_approved');
  assert.equal(item.release.fulfillmentRuntimeVerified, true);
  assert.equal(item.active, false);
  assert.equal(item.release.deployApproved, false);
});

test('stays unavailable at a nonzero price until every server verification gate is true', () => {
  const item = getConfiguredCommerceItem('home-inspection-study-guide');
  assert.equal(item.amountCents, 4900);
  assert.equal(item.active, false);
  assert.throws(() => getCommerceItem(item.sku), /unavailable/);
  assert.deepEqual(listPublicCommerceItems(), []);
});

test('activation predicate requires every authoritative verification gate', () => {
  const configured = getConfiguredCommerceItem('home-inspection-study-guide');
  const ready = {
    ...configured,
    active:true,
    quickBooks:{...configured.quickBooks,itemId:'verified-item-id',itemVerified:true},
    tax:{...configured.tax,accountantVerified:true},
    artifact:{...configured.artifact,generation:'1785951381246665',objectVerified:true},
    release:{...configured.release,fulfillmentRuntimeVerified:true,deployApproved:true},
  };
  assert.equal(isCommerceItemPurchasable(ready), false);
  assert.equal(isCommerceItemPurchasable(ready, verifiedPaymentsCapability), true);
  for (const blocked of [
    {...ready,active:false},
    {...ready,quickBooks:{...ready.quickBooks,itemId:null}},
    {...ready,quickBooks:{...ready.quickBooks,itemVerified:false}},
    {...ready,quickBooks:{...ready.quickBooks,itemName:'Other Product'}},
    {...ready,tax:{...ready.tax,classificationApproved:false}},
    {...ready,tax:{...ready.tax,accountantVerified:false}},
    {...ready,tax:{...ready.tax,quickBooksTaxCode:''}},
    {...ready,artifact:{...ready.artifact,objectVerified:false}},
    {...ready,artifact:{...ready.artifact,generation:null}},
    {...ready,artifact:{...ready.artifact,md5Hash:''}},
    {...ready,release:{...ready.release,ownerPilotApproved:false}},
    {...ready,release:{...ready.release,priceApproved:false}},
    {...ready,release:{...ready.release,fulfillmentRuntimeVerified:false}},
    {...ready,release:{...ready.release,deployApproved:false}},
  ]) assert.equal(isCommerceItemPurchasable(blocked, verifiedPaymentsCapability), false);
});

test('does not disclose private configuration through buyer capabilities', () => {
  const serialized = JSON.stringify(listCommerceCapabilities());
  assert.doesNotMatch(serialized, /private-commerce|guide-v1|sha256|md5|generation|71250419|itemId|tax/i);
});

test('rejects unknown or inactive products', () => {
  assert.throws(() => getCommerceItem('not-a-product'), /unavailable/);
});

test('does not publish inactive products', () => {
  const items = listPublicCommerceItems();
  assert.deepEqual(items, []);
  assert.equal(Object.isFrozen(items), true);
});

test('publishes only strict buyer-safe SKU and display capability fields', () => {
  assert.deepEqual(listCommerceCapabilities(), [
    {sku:'home-inspection-study-guide',active:false,display:{
      name:'Home Inspection Study Guide',amountCents:4900,currency:'USD',
      invoiceProvider:'quickbooks',paymentMethods:['card','apple_pay','paypal','venmo'],
      delivery:'protected_electronic_delivery',
    }},
  ]);
  assert.deepEqual(Object.keys(listCommerceCapabilities()[0]), ['sku','active','display']);
  assert.deepEqual(Object.keys(listCommerceCapabilities()[0].display), ['name','amountCents','currency','invoiceProvider','paymentMethods','delivery']);
  assert.equal(Object.isFrozen(listCommerceCapabilities()[0]), true);
  assert.equal(Object.isFrozen(listCommerceCapabilities()[0].display), true);
});

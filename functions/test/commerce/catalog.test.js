import test from 'node:test';
import assert from 'node:assert/strict';
import {getCommerceItem, getConfiguredCommerceItem, isCommerceItemPurchasable, listPublicCommerceItems, listCommerceCapabilities} from '../../src/commerce/catalog.js';

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
  assert.equal(item.quickBooks.itemId, null);
  assert.equal(item.quickBooks.itemVerified, false);
  assert.equal(item.tax.classification, 'ca_electronic_only_non_taxable_proposed');
  assert.equal(item.tax.quickBooksTaxCode, 'NON');
  assert.equal(item.tax.accountantVerified, false);
  assert.equal(item.artifact.objectKey, 'private-commerce/home-inspection-study-guide/guide-v1.pdf');
  assert.equal(item.artifact.contentType, 'application/pdf');
  assert.equal(item.artifact.maxBytes, 71250419);
  assert.equal(item.artifact.sha256, '2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d');
  assert.equal(item.artifact.objectVerified, false);
  assert.equal(item.release.deployApproved, false);
  assert.equal(Object.isFrozen(item), true);
  assert.equal(Object.isFrozen(item.artifact), true);
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
    artifact:{...configured.artifact,objectVerified:true},
    release:{...configured.release,fulfillmentRuntimeVerified:true,deployApproved:true},
  };
  assert.equal(isCommerceItemPurchasable(ready), true);
  for (const blocked of [
    {...ready,active:false},
    {...ready,quickBooks:{...ready.quickBooks,itemId:null}},
    {...ready,quickBooks:{...ready.quickBooks,itemVerified:false}},
    {...ready,tax:{...ready.tax,classificationApproved:false}},
    {...ready,tax:{...ready.tax,accountantVerified:false}},
    {...ready,artifact:{...ready.artifact,objectVerified:false}},
    {...ready,release:{...ready.release,ownerPilotApproved:false}},
    {...ready,release:{...ready.release,priceApproved:false}},
    {...ready,release:{...ready.release,fulfillmentRuntimeVerified:false}},
    {...ready,release:{...ready.release,deployApproved:false}},
  ]) assert.equal(isCommerceItemPurchasable(blocked), false);
});

test('does not disclose private configuration through buyer capabilities', () => {
  const serialized = JSON.stringify(listCommerceCapabilities());
  assert.doesNotMatch(serialized, /private-commerce|guide-v1|sha256|71250419|quickbooks/i);
});

test('rejects unknown or inactive products', () => {
  assert.throws(() => getCommerceItem('not-a-product'), /unavailable/);
});

test('does not publish inactive products', () => {
  const items = listPublicCommerceItems();
  assert.deepEqual(items, []);
  assert.equal(Object.isFrozen(items), true);
});

test('publishes only strict buyer-safe SKU capability fields', () => {
  assert.deepEqual(listCommerceCapabilities(), [
    {sku:'home-inspection-study-guide',active:false},
  ]);
  assert.deepEqual(Object.keys(listCommerceCapabilities()[0]), ['sku','active']);
  assert.equal(Object.isFrozen(listCommerceCapabilities()[0]), true);
});

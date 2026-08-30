import test from 'node:test';
import assert from 'node:assert/strict';
import {getCommerceItem, listPublicCommerceItems, listCommerceCapabilities} from '../../src/commerce/catalog.js';

test('keeps a known digital product unavailable before owner approval', () => {
  assert.throws(() => getCommerceItem('home-inspection-study-guide'), /unavailable/);
});

test('does not let a browser-supplied amount bypass inactivity', () => {
  assert.throws(
    () => getCommerceItem('home-inspection-study-guide', {amountCents: 1}),
    /unavailable/
  );
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

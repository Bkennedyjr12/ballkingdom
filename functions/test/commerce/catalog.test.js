import test from 'node:test';
import assert from 'node:assert/strict';
import {getCommerceItem, listPublicCommerceItems} from '../../src/commerce/catalog.js';

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

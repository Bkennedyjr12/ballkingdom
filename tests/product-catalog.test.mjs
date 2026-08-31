import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, getProductBySlug, getPrimaryProducts } from '../assets/js/product-catalog.js';

test('catalog exposes the three approved primary products and human service', () => {
  assert.deepEqual(PRODUCTS.map(({ slug }) => slug), [
    'sba-ready-business-acquisition-toolkit',
    'home-inspection-study-guide',
    'personalized-career-opportunity-blueprint',
    'career-strategy-network-navigation'
  ]);
  assert.equal(getPrimaryProducts().length, 3);
});

test('all commerce states fail closed before payment integration', () => {
  for (const product of PRODUCTS) {
    assert.ok(['coming-soon', 'free-intake-preview'].includes(product.availability));
    assert.doesNotMatch(product.href, /guide\.pdf|quickbooks|intuit/i);
  }
});

test('shows the approved founding price without claiming checkout is active', () => {
  const guide = getProductBySlug('home-inspection-study-guide');
  assert.equal(guide.priceLabel, '$49 founding price · Checkout coming soon');
  assert.equal(guide.availability, 'coming-soon');
  assert.doesNotMatch(JSON.stringify(guide), /private-commerce|guide-v1\.pdf|2bdf6b760b/i);
});

test('approved names and five-business-day promise are exact', () => {
  assert.equal(getProductBySlug('personalized-career-opportunity-blueprint').name, 'Personalized Career Opportunity Blueprint');
  const human = getProductBySlug('career-strategy-network-navigation');
  assert.equal(human.name, 'Career Strategy & Network Navigation');
  assert.match(human.summary, /five business days/i);
  assert.match(human.disclaimer, /not guaranteed/i);
});

test('unknown slugs return null', () => {
  assert.equal(getProductBySlug('missing'), null);
});

test('catalog fragments match rendered product card ids', () => {
  for (const product of getPrimaryProducts()) {
    if (product.href.startsWith('products.html#')) {
      assert.equal(product.href, `products.html#${product.slug}`);
    }
  }
});

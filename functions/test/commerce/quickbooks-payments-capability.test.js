import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPaymentsCapability} from '../../src/providers/quickbooks-payments-capability.js';

function verifiedConfig(overrides = {}) {
  return {
    accounting:true,payments:true,mode:'documented-intuit-flow',
    supportsImmediatePayment:true,supportsPayPal:true,supportsWebhooks:true,
    ...overrides,
  };
}

test('rejects accounting-only Intuit configuration', () => {
  assert.throws(() => assertPaymentsCapability({accounting:true,payments:false}), /Payments capability/);
});

test('normalizes a verified QuickBooks Payments capability', () => {
  assert.deepEqual(assertPaymentsCapability(verifiedConfig()), {
    mode:'documented-intuit-flow',supportsImmediatePayment:true,
    supportsPayPal:true,supportsWebhooks:true,
  });
});

test('rejects string values for accounting and payments verification', () => {
  for (const config of [
    verifiedConfig({accounting:'true'}),
    verifiedConfig({payments:'false'}),
  ]) {
    assert.throws(() => assertPaymentsCapability(config), /Payments capability/);
  }
});

test('rejects a blank documented payment mode', () => {
  assert.throws(() => assertPaymentsCapability(verifiedConfig({mode:'  '})), /missing mode/);
});

test('rejects non-boolean payment support flags', () => {
  for (const config of [
    verifiedConfig({supportsImmediatePayment:'true'}),
    verifiedConfig({supportsPayPal:1}),
    verifiedConfig({supportsWebhooks:null}),
  ]) {
    assert.throws(() => assertPaymentsCapability(config), /must be boolean/);
  }
});

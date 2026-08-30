import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPaymentsCapability} from '../../src/providers/quickbooks-payments-capability.js';

test('rejects accounting-only Intuit configuration', () => {
  assert.throws(() => assertPaymentsCapability({accounting:true,payments:false}), /Payments capability/);
});

test('normalizes a verified QuickBooks Payments capability', () => {
  assert.deepEqual(assertPaymentsCapability({
    accounting:true,payments:true,mode:'documented-intuit-flow',
    supportsImmediatePayment:true,supportsPayPal:true,supportsWebhooks:true,
  }), {
    mode:'documented-intuit-flow',supportsImmediatePayment:true,
    supportsPayPal:true,supportsWebhooks:true,
  });
});

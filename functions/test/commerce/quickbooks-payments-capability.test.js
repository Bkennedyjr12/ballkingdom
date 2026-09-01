import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPaymentsCapability} from '../../src/providers/quickbooks-payments-capability.js';

function verifiedConfig(overrides = {}) {
  return {
    accounting:true,payments:true,mode:'documented-intuit-flow',
    supportsImmediatePayment:true,supportsCards:true,supportsApplePay:true,
    supportsPayPal:true,supportsAch:true,supportsWebhooks:true,
    surchargingEnabled:false,onlineInvoiceDelivery:true,
    ...overrides,
  };
}

test('rejects accounting-only Intuit configuration', () => {
  assert.throws(() => assertPaymentsCapability({accounting:true,payments:false}), /Payments capability/);
});

test('requires Apple Pay-compatible QuickBooks invoice settings', () => {
  assert.deepEqual(assertPaymentsCapability(verifiedConfig()), {
    mode:'documented-intuit-flow',supportsImmediatePayment:true,supportsCards:true,
    supportsApplePay:true,supportsPayPal:true,supportsAch:true,supportsWebhooks:true,
    surchargingEnabled:false,onlineInvoiceDelivery:true,
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
  const booleanKeys = [
    'supportsImmediatePayment','supportsCards','supportsApplePay','supportsPayPal',
    'supportsAch','supportsWebhooks','surchargingEnabled','onlineInvoiceDelivery',
  ];
  for (const key of booleanKeys) {
    const config = verifiedConfig({[key]:'not-a-boolean'});
    assert.throws(() => assertPaymentsCapability(config), /must be boolean/);
  }
});

test('rejects every unverified required payment capability and enabled surcharging', () => {
  const invalidOverrides = [
    {supportsImmediatePayment:false},
    {supportsCards:false},
    {supportsApplePay:false},
    {supportsPayPal:false},
    {supportsAch:false},
    {supportsWebhooks:false},
    {surchargingEnabled:true},
    {onlineInvoiceDelivery:false},
  ];
  for (const override of invalidOverrides) {
    assert.throws(
      () => assertPaymentsCapability(verifiedConfig(override)),
      /Payments capability is unavailable/,
      Object.keys(override)[0]
    );
  }
});

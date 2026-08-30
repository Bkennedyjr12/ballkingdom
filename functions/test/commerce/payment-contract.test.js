import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaymentResult} from '../../src/commerce/payment-contract.js';
import {publicCommerceError} from '../../src/commerce/public-errors.js';

const expected = {
  realmId: '9130357984612498',
  amountCents: 4900,
  currency: 'USD',
  providerOrderRef: 'bk-order-42',
};

const completedResult = {
  realmId: '9130357984612498',
  amountCents: 4900,
  currency: 'USD',
  providerOrderRef: 'bk-order-42',
  providerPaymentRef: 'payment-opaque-42',
  status: 'completed',
  cardNumber: '4111111111111111',
  providerBody: {token: 'secret'},
};

test('returns only an opaque receipt for an exactly matched completed payment', () => {
  assert.deepEqual(validatePaymentResult(completedResult, expected), {
    providerPaymentRef: 'payment-opaque-42',
  });
});

test('rejects a payment from the wrong realm or for the wrong amount', () => {
  assert.throws(
    () => validatePaymentResult(
      {...completedResult, realmId: 'wrong', amountCents: 1},
      expected
    ),
    /Payment verification mismatch/
  );
});

test('rejects non-integer amounts, non-uppercase currencies, wrong order references, and incomplete statuses', () => {
  for (const result of [
    {...completedResult, amountCents: 4900.01},
    {...completedResult, currency: 'usd'},
    {...completedResult, providerOrderRef: 'bk-order-43'},
    {...completedResult, status: 'pending'},
  ]) {
    assert.throws(() => validatePaymentResult(result, expected), /Payment verification mismatch/);
  }
});

test('never exposes internal payment or customer details in public errors', () => {
  const error = Object.assign(new Error('provider said token=super-secret for ada@example.test'), {
    code: 'PAYMENT_VERIFICATION_MISMATCH',
    providerBody: {accessToken: 'super-secret'},
    customer: {email: 'ada@example.test'},
  });
  error.stack = 'stack with private values';

  assert.deepEqual(publicCommerceError(error), {code: 'payment-mismatch'});
});

test('maps only the supported public commerce error codes', () => {
  assert.deepEqual(publicCommerceError({code: 'ORDER_INVALID'}), {code: 'invalid-order'});
  assert.deepEqual(publicCommerceError({code: 'PAYMENT_PENDING'}), {code: 'payment-pending'});
  assert.deepEqual(publicCommerceError({code: 'FULFILLMENT_FAILED'}), {code: 'fulfillment-delayed'});
  assert.deepEqual(publicCommerceError({code: 'UNEXPECTED_PROVIDER_FAILURE'}), {code: 'service-unavailable'});
});

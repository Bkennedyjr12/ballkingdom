import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrder, transitionOrder} from '../../src/commerce/order-state.js';
import {publicCommerceError} from '../../src/commerce/public-errors.js';

const digitalItem = {
  sku: 'study-guide',
  name: 'Study Guide',
  amountCents: 4900,
  currency: 'USD',
  orderType: 'digital_product',
  fulfillmentType: 'protected_download',
};

const serviceItem = {
  sku: 'private-coaching',
  name: 'Private Coaching',
  amountCents: 15000,
  currency: 'USD',
  orderType: 'service',
  fulfillmentType: 'service_handoff',
};

function captureError(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  assert.fail('Expected operation to throw');
}

test('creates digital orders pending payment from the server item', () => {
  const order = newOrder({item: digitalItem, customer: {name: 'Ada', email: 'ada@example.test'}});

  assert.deepEqual(order, {
    sku: 'study-guide',
    name: 'Study Guide',
    amountCents: 4900,
    currency: 'USD',
    orderType: 'digital_product',
    fulfillmentType: 'protected_download',
    customer: {name: 'Ada', email: 'ada@example.test'},
    status: 'pending_payment',
  });
});

test('projects only permitted customer fields and freezes the normalized customer', () => {
  const order = newOrder({
    item: digitalItem,
    customer: {
      name: 'Ada',
      email: 'ada@example.test',
      accessToken: 'must-not-be-retained',
      payment: {cardNumber: '4111111111111111'},
      credentials: {password: 'must-not-be-retained'},
    },
  });

  assert.deepEqual(order.customer, {name: 'Ada', email: 'ada@example.test'});
  assert.equal(Object.isFrozen(order.customer), true);
  assert.equal(Object.hasOwn(order.customer, 'accessToken'), false);
  assert.equal(Object.hasOwn(order.customer, 'payment'), false);
  assert.equal(Object.hasOwn(order.customer, 'credentials'), false);
});

test('rejects non-string permitted customer fields', () => {
  assert.throws(
    () => newOrder({item: digitalItem, customer: {name: {display: 'Ada'}}}),
    {code: 'ORDER_INVALID'}
  );
  assert.throws(
    () => newOrder({item: digitalItem, customer: {name: 'Ada', email: {value: 'ada@example.test'}}}),
    {code: 'ORDER_INVALID'}
  );
});

test('creates service orders pending invoice approval', () => {
  const order = newOrder({item: serviceItem, customer: {name: 'Grace', email: 'grace@example.test'}});

  assert.equal(order.status, 'pending_invoice_approval');
});

test('allows verified payment to advance exactly once', () => {
  const verifying = {status: 'payment_verifying', amountCents: 4900, currency: 'USD'};

  assert.equal(transitionOrder(verifying, {type: 'PAYMENT_VERIFIED'}).status, 'paid');
  assert.throws(
    () => transitionOrder({status: 'paid'}, {type: 'PAYMENT_VERIFIED'}),
    /Invalid order transition/
  );
});

test('rejects inherited event names instead of reading transition prototypes', () => {
  for (const type of ['toString', 'constructor', '__proto__']) {
    assert.throws(
      () => transitionOrder({status: 'pending_payment'}, {type}),
      {code: 'INVALID_ORDER_TRANSITION'}
    );
  }
});

test('maps an actual invalid transition to the safe invalid-order public code', () => {
  const error = captureError(() => transitionOrder({status: 'paid'}, {type: 'PAYMENT_VERIFIED'}));

  assert.equal(error.code, 'INVALID_ORDER_TRANSITION');
  assert.deepEqual(publicCommerceError(error), {code: 'invalid-order'});
});

test('does not treat a browser payment redirect as payment proof', () => {
  assert.throws(
    () => transitionOrder({status: 'pending_payment'}, {type: 'PAYMENT_REDIRECTED'}),
    /Invalid order transition/
  );
});

test('preserves paid state when fulfillment fails', () => {
  const result = transitionOrder(
    {status: 'fulfilling'},
    {type: 'FULFILLMENT_FAILED', code: 'delivery_failed'}
  );

  assert.equal(result.status, 'paid');
  assert.equal(result.lastErrorCode, 'delivery_failed');
});

test('requires invoice approval before a service payment can be verified', () => {
  const pendingApproval = newOrder({item: serviceItem, customer: {name: 'Grace'}});
  const processing = transitionOrder(pendingApproval, {type: 'INVOICE_APPROVED'});
  const invoiced = transitionOrder(processing, {type: 'INVOICE_CREATED'});
  const verifying = transitionOrder(invoiced, {type: 'PAYMENT_VERIFICATION_REQUESTED'});
  const paid = transitionOrder(verifying, {type: 'PAYMENT_VERIFIED'});

  assert.equal(processing.status, 'invoice_processing');
  assert.equal(invoiced.status, 'invoiced');
  assert.equal(verifying.status, 'payment_verifying');
  assert.equal(paid.status, 'paid');
});

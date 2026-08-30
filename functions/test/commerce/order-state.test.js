import test from 'node:test';
import assert from 'node:assert/strict';
import {newOrder, transitionOrder} from '../../src/commerce/order-state.js';

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

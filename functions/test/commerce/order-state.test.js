import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  isAllowedOrderStatusTransition,
  isFinalOrderStatus,
  isOrderStatus,
  isReconciliationTerminalStatus,
  newOrder,
  transitionOrder,
} from '../../src/commerce/order-state.js';
import {publicCommerceError} from '../../src/commerce/public-errors.js';

const digitalItem = {
  sku: 'study-guide',
  name: 'Study Guide',
  amountCents: 4900,
  currency: 'USD',
  orderType: 'digital_product',
  fulfillmentType: 'protected_download',
  quickBooks:{itemId:'item-4',itemName:'Study Guide',itemVerified:true},
  tax:{quickBooksTaxCode:'NON',accountantVerified:true},
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
    accountingSnapshot: {
      provider:'quickbooks',itemId:'item-4',itemName:'Study Guide',taxCode:'NON',
      fingerprint:createHash('sha256').update('quickbooks\0item-4\0Study Guide\0NON').digest('hex'),
    },
    customer: {name: 'Ada', email: 'ada@example.test'},
    status: 'pending_payment',
  });
});

test('rejects a digital order without an exact verified QuickBooks item and tax snapshot', () => {
  for (const item of [
    {...digitalItem,quickBooks:undefined},
    {...digitalItem,quickBooks:{...digitalItem.quickBooks,itemId:null}},
    {...digitalItem,quickBooks:{...digitalItem.quickBooks,itemVerified:false}},
    {...digitalItem,tax:{...digitalItem.tax,accountantVerified:false}},
  ]) assert.throws(() => newOrder({item,customer:{name:'Ada'}}), {code:'ORDER_INVALID'});
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

test('exports storage-safe status metadata from the same transition source', () => {
  assert.equal(isOrderStatus('payment_verifying'), true);
  assert.equal(isOrderStatus('invented'), false);
  assert.equal(isAllowedOrderStatusTransition('pending_payment', 'payment_verifying'), true);
  assert.equal(isAllowedOrderStatusTransition('pending_payment', 'fulfilled'), false);
  assert.equal(isReconciliationTerminalStatus('manual_review'), true);
  assert.equal(isReconciliationTerminalStatus('paid'), false);
  assert.equal(isFinalOrderStatus('refunded'), true);
  assert.equal(isFinalOrderStatus('fulfilled'), false);
});

test('shared storage predicate has exhaustive parity with the Task 3 transition graph', () => {
  const expectedTargets = {
    created: ['pending_payment', 'pending_invoice_approval', 'cancelled'],
    pending_payment: ['payment_verifying', 'manual_review', 'cancelled'],
    payment_verifying: ['paid', 'pending_payment', 'manual_review', 'cancelled'],
    pending_invoice_approval: ['invoice_processing', 'cancelled'],
    invoice_processing: ['invoiced', 'pending_invoice_approval'],
    invoiced: ['payment_verifying', 'cancelled'],
    paid: ['fulfilling', 'refunded'],
    fulfilling: ['fulfilled', 'paid', 'refunded'],
    fulfilled: ['refunded'],
    manual_review: ['cancelled', 'refunded'],
    cancelled: [],
    refunded: [],
  };
  const statuses = Object.keys(expectedTargets);

  for (const currentStatus of statuses) {
    for (const nextStatus of statuses) {
      assert.equal(
        isAllowedOrderStatusTransition(currentStatus, nextStatus),
        expectedTargets[currentStatus].includes(nextStatus),
        `${currentStatus} -> ${nextStatus}`
      );
    }
  }
});

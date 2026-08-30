const ORDER_STATUSES = new Set([
  'created',
  'pending_payment',
  'payment_verifying',
  'pending_invoice_approval',
  'invoice_processing',
  'invoiced',
  'paid',
  'fulfilling',
  'fulfilled',
  'cancelled',
  'refunded',
  'manual_review',
]);

const TRANSITIONS = Object.freeze({
  created: Object.freeze({
    START_PAYMENT: 'pending_payment',
    REQUEST_INVOICE_APPROVAL: 'pending_invoice_approval',
    CANCEL: 'cancelled',
  }),
  pending_payment: Object.freeze({
    PAYMENT_VERIFICATION_REQUESTED: 'payment_verifying',
    PAYMENT_MISMATCH: 'manual_review',
    CANCEL: 'cancelled',
  }),
  payment_verifying: Object.freeze({
    PAYMENT_VERIFIED: 'paid',
    PAYMENT_PENDING: 'pending_payment',
    PAYMENT_MISMATCH: 'manual_review',
    CANCEL: 'cancelled',
  }),
  pending_invoice_approval: Object.freeze({
    INVOICE_APPROVED: 'invoice_processing',
    CANCEL: 'cancelled',
  }),
  invoice_processing: Object.freeze({
    INVOICE_CREATED: 'invoiced',
    INVOICE_FAILED: 'pending_invoice_approval',
  }),
  invoiced: Object.freeze({
    PAYMENT_VERIFICATION_REQUESTED: 'payment_verifying',
    CANCEL: 'cancelled',
  }),
  paid: Object.freeze({
    FULFILLMENT_REQUESTED: 'fulfilling',
    REFUND_VERIFIED: 'refunded',
  }),
  fulfilling: Object.freeze({
    FULFILLMENT_COMPLETED: 'fulfilled',
    FULFILLMENT_FAILED: 'paid',
    REFUND_VERIFIED: 'refunded',
  }),
  fulfilled: Object.freeze({REFUND_VERIFIED: 'refunded'}),
  manual_review: Object.freeze({CANCEL: 'cancelled', REFUND_VERIFIED: 'refunded'}),
  cancelled: Object.freeze({}),
  refunded: Object.freeze({}),
});

function invalidOrder() {
  throw new Error('Invalid order');
}

function isRequiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeErrorCode(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9_-]+$/.test(value) ? value : fallback;
}

function initialStatus(orderType) {
  if (orderType === 'digital_product') return 'pending_payment';
  if (orderType === 'service') return 'pending_invoice_approval';
  invalidOrder();
}

export function newOrder({item, customer} = {}) {
  if (
    !item ||
    !customer ||
    !isRequiredString(item.sku) ||
    !isRequiredString(item.name) ||
    !Number.isInteger(item.amountCents) ||
    item.amountCents <= 0 ||
    !isRequiredString(item.currency) ||
    item.currency !== item.currency.toUpperCase() ||
    !isRequiredString(item.fulfillmentType)
  ) {
    invalidOrder();
  }

  return Object.freeze({
    sku: item.sku,
    name: item.name,
    amountCents: item.amountCents,
    currency: item.currency,
    orderType: item.orderType,
    fulfillmentType: item.fulfillmentType,
    customer: Object.freeze({...customer}),
    status: initialStatus(item.orderType),
  });
}

export function transitionOrder(order, event) {
  const nextStatus = TRANSITIONS[order?.status]?.[event?.type];
  if (!ORDER_STATUSES.has(order?.status) || !nextStatus) {
    throw new Error('Invalid order transition');
  }

  const nextOrder = {...order, status: nextStatus};
  if (event.type === 'FULFILLMENT_FAILED') {
    nextOrder.lastErrorCode = safeErrorCode(event.code, 'fulfillment_failed');
  }
  if (event.type === 'INVOICE_FAILED') {
    nextOrder.lastErrorCode = safeErrorCode(event.code, 'invoice_failed');
  }
  return Object.freeze(nextOrder);
}

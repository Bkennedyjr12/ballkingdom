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
const RECONCILIATION_TERMINAL_STATUSES = new Set([
  'fulfilled',
  'cancelled',
  'refunded',
  'manual_review',
]);
const FINAL_ORDER_STATUSES = new Set(['cancelled', 'refunded']);

export function isOrderStatus(value) {
  return ORDER_STATUSES.has(value);
}

export function isAllowedOrderStatusTransition(currentStatus, nextStatus) {
  return Object.hasOwn(TRANSITIONS, currentStatus)
    && Object.values(TRANSITIONS[currentStatus]).includes(nextStatus);
}

export function isReconciliationTerminalStatus(status) {
  return RECONCILIATION_TERMINAL_STATUSES.has(status);
}

export function isFinalOrderStatus(status) {
  return FINAL_ORDER_STATUSES.has(status);
}

function invalidOrder() {
  const error = new Error('Invalid order');
  error.code = 'ORDER_INVALID';
  throw error;
}

function invalidTransition() {
  const error = new Error('Invalid order transition');
  error.code = 'INVALID_ORDER_TRANSITION';
  throw error;
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

function normalizeCustomer(customer) {
  if (
    !customer ||
    typeof customer !== 'object' ||
    Array.isArray(customer) ||
    !Object.hasOwn(customer, 'name') ||
    !isRequiredString(customer.name) ||
    (Object.hasOwn(customer, 'email') && !isRequiredString(customer.email))
  ) {
    invalidOrder();
  }

  const normalized = {name: customer.name};
  if (Object.hasOwn(customer, 'email')) normalized.email = customer.email;
  return Object.freeze(normalized);
}

export function newOrder({item, customer} = {}) {
  if (
    !item ||
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
    customer: normalizeCustomer(customer),
    status: initialStatus(item.orderType),
  });
}

export function transitionOrder(order, event) {
  if (!ORDER_STATUSES.has(order?.status) || !Object.hasOwn(TRANSITIONS, order.status)) {
    invalidTransition();
  }
  const transitions = TRANSITIONS[order.status];
  if (!Object.hasOwn(transitions, event?.type)) {
    invalidTransition();
  }
  const nextStatus = transitions[event.type];

  const nextOrder = {...order, status: nextStatus};
  if (event.type === 'FULFILLMENT_FAILED') {
    nextOrder.lastErrorCode = safeErrorCode(event.code, 'fulfillment_failed');
  }
  if (event.type === 'INVOICE_FAILED') {
    nextOrder.lastErrorCode = safeErrorCode(event.code, 'invoice_failed');
  }
  return Object.freeze(nextOrder);
}

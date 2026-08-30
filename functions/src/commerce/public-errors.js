const PUBLIC_CODES = Object.freeze({
  ORDER_INVALID: 'invalid-order',
  ORDER_NOT_FOUND: 'invalid-order',
  INVALID_ORDER: 'invalid-order',
  INVALID_ORDER_TRANSITION: 'invalid-order',
  PAYMENT_PENDING: 'payment-pending',
  PAYMENT_VERIFICATION_PENDING: 'payment-pending',
  PAYMENT_MISMATCH: 'payment-mismatch',
  PAYMENT_VERIFICATION_MISMATCH: 'payment-mismatch',
  FULFILLMENT_FAILED: 'fulfillment-delayed',
  FULFILLMENT_DELAYED: 'fulfillment-delayed',
});

export function publicCommerceError(error) {
  return Object.freeze({
    code: PUBLIC_CODES[error?.code] ?? 'service-unavailable',
  });
}

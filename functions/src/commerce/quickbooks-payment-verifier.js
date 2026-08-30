import {validatePaymentResult} from './payment-contract.js';

const EVIDENCE_KEYS = ['invoice','payments','realmId'];
const INVOICE_KEYS = [
  'balanceCents',
  'currency',
  'entityState',
  'invoiceId',
  'paymentState',
  'providerOrderRef',
  'totalAmountCents',
];
const PAYMENT_KEYS = [
  'applications',
  'entityState',
  'providerPaymentRef',
  'totalAmountCents',
  'unappliedAmountCents',
];
const APPLICATION_KEYS = ['amountCents','linkedTxnId','linkedTxnType'];
const EXPECTED_KEYS = ['amountCents','currency','invoiceId','providerOrderRef','realmId'];

function mismatch() {
  const error = new Error('Payment verification mismatch');
  error.code = 'PAYMENT_VERIFICATION_MISMATCH';
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isCurrency(value) {
  return isNonEmptyString(value) && /^[A-Z]{3}$/.test(value);
}

function isNonNegativeCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveCents(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isValidExpected(expected) {
  return (
    hasExactKeys(expected, EXPECTED_KEYS) &&
    isNonEmptyString(expected.realmId) &&
    isNonEmptyString(expected.invoiceId) &&
    isNonEmptyString(expected.providerOrderRef) &&
    isPositiveCents(expected.amountCents) &&
    isCurrency(expected.currency)
  );
}

function isValidInvoice(invoice, expected) {
  return (
    hasExactKeys(invoice, INVOICE_KEYS) &&
    isNonEmptyString(invoice.invoiceId) &&
    invoice.invoiceId === expected.invoiceId &&
    isNonEmptyString(invoice.providerOrderRef) &&
    invoice.providerOrderRef === expected.providerOrderRef &&
    isPositiveCents(invoice.totalAmountCents) &&
    invoice.totalAmountCents === expected.amountCents &&
    isNonNegativeCents(invoice.balanceCents) &&
    invoice.balanceCents === 0 &&
    isCurrency(invoice.currency) &&
    invoice.currency === expected.currency &&
    invoice.entityState === 'present' &&
    invoice.paymentState === 'paid'
  );
}

function isValidPayment(payment, expected) {
  if (
    !hasExactKeys(payment, PAYMENT_KEYS) ||
    !isNonEmptyString(payment.providerPaymentRef) ||
    payment.entityState !== 'present' ||
    !isPositiveCents(payment.totalAmountCents) ||
    payment.totalAmountCents !== expected.amountCents ||
    !isNonNegativeCents(payment.unappliedAmountCents) ||
    payment.unappliedAmountCents !== 0 ||
    !Array.isArray(payment.applications) ||
    payment.applications.length !== 1
  ) {
    return false;
  }
  const application = payment.applications[0];
  return (
    hasExactKeys(application, APPLICATION_KEYS) &&
    isNonEmptyString(application.linkedTxnId) &&
    application.linkedTxnId === expected.invoiceId &&
    application.linkedTxnType === 'Invoice' &&
    isPositiveCents(application.amountCents) &&
    application.amountCents === expected.amountCents
  );
}

export function verifyQuickBooksPaymentEvidence(evidence, expected) {
  if (
    !isValidExpected(expected) ||
    !hasExactKeys(evidence, EVIDENCE_KEYS) ||
    !isNonEmptyString(evidence.realmId) ||
    evidence.realmId !== expected.realmId ||
    !isValidInvoice(evidence.invoice, expected) ||
    !Array.isArray(evidence.payments) ||
    evidence.payments.length !== 1 ||
    !isValidPayment(evidence.payments[0], expected)
  ) {
    throw mismatch();
  }

  const payment = evidence.payments[0];
  return validatePaymentResult({
    realmId:evidence.realmId,
    amountCents:payment.totalAmountCents,
    currency:evidence.invoice.currency,
    providerOrderRef:evidence.invoice.providerOrderRef,
    providerPaymentRef:payment.providerPaymentRef,
    status:'completed',
  }, expected);
}

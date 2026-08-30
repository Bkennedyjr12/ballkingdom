function isExactNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isUppercaseCurrency(value) {
  return isExactNonEmptyString(value) && value === value.toUpperCase();
}

function isValidExpected(expected) {
  return (
    isExactNonEmptyString(expected?.realmId) &&
    Number.isInteger(expected?.amountCents) &&
    expected.amountCents > 0 &&
    isUppercaseCurrency(expected.currency) &&
    isExactNonEmptyString(expected.providerOrderRef)
  );
}

function matchesExpected(result, expected) {
  return (
    isValidExpected(expected) &&
    isExactNonEmptyString(result?.realmId) &&
    result.realmId === expected.realmId &&
    Number.isInteger(result.amountCents) &&
    result.amountCents === expected.amountCents &&
    isUppercaseCurrency(result.currency) &&
    result.currency === expected.currency &&
    isExactNonEmptyString(result.providerOrderRef) &&
    result.providerOrderRef === expected.providerOrderRef &&
    isExactNonEmptyString(result.providerPaymentRef) &&
    result.status === 'completed'
  );
}

export function validatePaymentResult(result, expected) {
  if (!matchesExpected(result, expected)) {
    const error = new Error('Payment verification mismatch');
    error.code = 'PAYMENT_VERIFICATION_MISMATCH';
    throw error;
  }

  return Object.freeze({providerPaymentRef: result.providerPaymentRef});
}

const BOOLEAN_KEYS = [
  'supportsImmediatePayment','supportsCards','supportsApplePay','supportsPayPal',
  'supportsAch','supportsWebhooks','surchargingEnabled','onlineInvoiceDelivery',
];

export function assertPaymentsCapability(config) {
  if (config?.accounting !== true || config?.payments !== true) {
    throw new Error('QuickBooks Payments capability is not verified');
  }
  const mode = String(config.mode ?? '').trim();
  if (!mode) throw new Error('Payments capability is missing mode');
  for (const key of BOOLEAN_KEYS) {
    if (typeof config[key] !== 'boolean') {
      throw new Error(`Payments capability ${key} must be boolean`);
    }
  }
  const requiredCapabilities = BOOLEAN_KEYS.filter(key => key !== 'surchargingEnabled');
  if (requiredCapabilities.some(key => config[key] !== true)
    || config.surchargingEnabled !== false) {
    throw new Error('Payments capability is unavailable');
  }
  return Object.freeze({
    mode,
    ...Object.fromEntries(BOOLEAN_KEYS.map(key => [key,config[key]])),
  });
}

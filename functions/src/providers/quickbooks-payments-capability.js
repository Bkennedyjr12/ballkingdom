export function assertPaymentsCapability(config) {
  if (config?.accounting !== true || config?.payments !== true) {
    throw new Error('QuickBooks Payments capability is not verified');
  }
  const mode = String(config.mode ?? '').trim();
  if (!mode) throw new Error('Payments capability is missing mode');
  for (const key of ['supportsImmediatePayment','supportsPayPal','supportsWebhooks']) {
    if (typeof config[key] !== 'boolean') {
      throw new Error(`Payments capability ${key} must be boolean`);
    }
  }
  return Object.freeze({
    mode,
    supportsImmediatePayment:config.supportsImmediatePayment,
    supportsPayPal:config.supportsPayPal,
    supportsWebhooks:config.supportsWebhooks,
  });
}

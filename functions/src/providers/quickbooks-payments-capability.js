export function assertPaymentsCapability(config) {
  if (!config?.accounting || !config?.payments) {
    throw new Error('QuickBooks Payments capability is not verified');
  }
  for (const key of ['mode','supportsImmediatePayment','supportsPayPal','supportsWebhooks']) {
    if (config[key] == null) throw new Error(`Payments capability is missing ${key}`);
  }
  return Object.freeze({
    mode:String(config.mode),
    supportsImmediatePayment:config.supportsImmediatePayment === true,
    supportsPayPal:config.supportsPayPal === true,
    supportsWebhooks:config.supportsWebhooks === true,
  });
}

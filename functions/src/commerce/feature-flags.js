import {defineBoolean} from 'firebase-functions/params';

export const COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED = defineBoolean(
  'COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED',
  {default: false}
);

export const COMMERCE_SERVICE_QBO_SEND_ENABLED = defineBoolean(
  'COMMERCE_SERVICE_QBO_SEND_ENABLED',
  {default: false}
);

export function readCommerceFeatureFlags({
  digitalInvoicePilotParam = COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED,
  serviceQboSendParam = COMMERCE_SERVICE_QBO_SEND_ENABLED,
} = {}) {
  const digitalInvoicePilotEnabled = digitalInvoicePilotParam.value();
  const serviceQboSendEnabled = serviceQboSendParam.value();
  if (typeof digitalInvoicePilotEnabled !== 'boolean'
    || typeof serviceQboSendEnabled !== 'boolean') {
    throw new TypeError('Commerce feature parameter values must be Boolean');
  }
  return Object.freeze({digitalInvoicePilotEnabled, serviceQboSendEnabled});
}

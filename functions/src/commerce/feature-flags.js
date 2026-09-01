import {defineBoolean} from 'firebase-functions/params';

export const COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED = defineBoolean(
  'COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED',
  {default: false},
);

export const COMMERCE_SERVICE_QBO_SEND_ENABLED = defineBoolean(
  'COMMERCE_SERVICE_QBO_SEND_ENABLED',
  {default: false}
);

export function readCommerceFeatureFlags({
  publicDigitalCheckoutParam = COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED,
  serviceQboSendParam = COMMERCE_SERVICE_QBO_SEND_ENABLED,
} = {}) {
  return Object.freeze({
    publicDigitalCheckoutEnabled: publicDigitalCheckoutParam.value() === true,
    serviceQboSendEnabled: serviceQboSendParam.value() === true,
  });
}

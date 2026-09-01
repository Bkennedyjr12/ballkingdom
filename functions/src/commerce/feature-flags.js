import {defineBoolean} from 'firebase-functions/params';

export const COMMERCE_PUBLIC_AUTH_RESUME_ENABLED = defineBoolean(
  'COMMERCE_PUBLIC_AUTH_RESUME_ENABLED',
  {default: false},
);

export const COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED = defineBoolean(
  'COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED',
  {default: false},
);

export const COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED = defineBoolean(
  'COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED',
  {default: false},
);

export const COMMERCE_SERVICE_QBO_SEND_ENABLED = defineBoolean(
  'COMMERCE_SERVICE_QBO_SEND_ENABLED',
  {default: false}
);

export function readCommerceFeatureFlags({
  publicAuthResumeParam = COMMERCE_PUBLIC_AUTH_RESUME_ENABLED,
  publicDigitalCheckoutParam = COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED,
  controlledOwnerPilotParam = COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED,
  serviceQboSendParam = COMMERCE_SERVICE_QBO_SEND_ENABLED,
} = {}) {
  return Object.freeze({
    publicAuthResumeEnabled: publicAuthResumeParam.value() === true,
    publicDigitalCheckoutEnabled: publicDigitalCheckoutParam.value() === true,
    controlledOwnerPilotEnabled: controlledOwnerPilotParam.value() === true,
    serviceQboSendEnabled: serviceQboSendParam.value() === true,
  });
}

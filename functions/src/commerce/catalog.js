import {assertPaymentsCapability} from '../providers/quickbooks-payments-capability.js';
import {listServiceOffers,taxGatePassed,isServiceBookingOffer,isAllowedBookingUrl} from './service-offers.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const PAYMENTS_CAPABILITY = deepFreeze({
  accounting:true,
  payments:true,
  mode:'documented-intuit-flow',
  supportsImmediatePayment:true,
  supportsCards:true,
  supportsApplePay:true,
  supportsPayPal:true,
  supportsAch:true,
  supportsWebhooks:true,
  surchargingEnabled:false,
  onlineInvoiceDelivery:true,
});

const INVOICE_PAYMENT_METHODS = Object.freeze(['card','apple_pay','paypal','venmo']);

const BASE_ITEMS = deepFreeze({
  'home-inspection-study-guide': {
    sku: 'home-inspection-study-guide',
    name: 'Home Inspection Study Guide',
    amountCents: 4900,
    currency: 'USD',
    orderType: 'digital_product',
    fulfillmentType: 'protected_download',
    delivery: 'electronic_only',
    physicalCopyIncluded: false,
    active: false,
    quickBooks: {
      itemName: 'Home Inspection Study Guide',
      itemId: '8',
      itemVerified: true,
    },
    tax: {
      classification: 'electronic_only_non_taxable_owner_approved',
      quickBooksTaxCode: 'NON',
      classificationApproved: true,
      accountantVerified: true,
      geographicRestriction: 'none_owner_approved',
      scope: 'Nationwide electronic-only delivery with no tangible copy or storage media',
    },
    artifact: {
      objectKey: 'private-commerce/home-inspection-study-guide/guide-v1.pdf',
      contentType: 'application/pdf',
      exactBytes: 71250419,
      sha256: '2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d',
      md5Hash: 'XXzfi6ddgB6rru9fLIrv7Q==',
      generation: '1788191152627469',
      objectVerified: true,
    },
    release: {
      ownerPilotApproved: true,
      priceApproved: true,
      fulfillmentRuntimeVerified: true,
      deployApproved: false,
    },
    sourceEvidence: {
      reviewedAt: '2026-08-30',
      taxSource: {
        publisher: 'California Department of Tax and Fee Administration',
        publication: 'Publication 109 — Nontaxable Sales',
        accessedAt: '2026-08-30',
        url: 'https://cdtfa.ca.gov/formspubs/pub109/nontaxable-sales.htm',
      },
    },
  }
});

const SERVICE_ITEMS = Object.fromEntries(listServiceOffers().map(offer => [offer.sku, offer]));
const STATIC_ITEMS = Object.freeze({...BASE_ITEMS,...SERVICE_ITEMS});
const runtimeVerifications = new Map();

// Applies a server-recorded QuickBooks item readback (written only by the admin
// ensureStrategySessionItem callable after exact readback) to a runtime-verifiable item.
export function applyRuntimeItemVerification(sku, verification) {
  const item = STATIC_ITEMS[String(sku || '')];
  if (!item || item.quickBooks?.runtimeVerifiable !== true) return false;
  if (verification == null) { runtimeVerifications.delete(item.sku); return false; }
  const itemId = verification.itemId;
  if (verification.verified !== true || typeof itemId !== 'string' || !/^[0-9]{1,20}$/.test(itemId)
    || verification.itemName !== item.quickBooks.itemName) {
    runtimeVerifications.delete(item.sku);
    return false;
  }
  runtimeVerifications.set(item.sku, itemId);
  return true;
}

export function clearRuntimeItemVerifications() { runtimeVerifications.clear(); }

function resolveItem(sku) {
  const item = STATIC_ITEMS[String(sku || '')];
  if (!item) return null;
  const itemId = runtimeVerifications.get(item.sku);
  if (!itemId) return item;
  return deepFreeze({...item,quickBooks:{...item.quickBooks,itemId,itemVerified:true}});
}

function allItems() { return Object.keys(STATIC_ITEMS).map(resolveItem); }

export function listRuntimeVerifiableSkus() {
  return Object.values(STATIC_ITEMS).filter(item => item.quickBooks?.runtimeVerifiable === true).map(item => item.sku);
}

function paymentsCapabilityVerified(capability) {
  try {
    assertPaymentsCapability(capability);
    return true;
  } catch {
    return false;
  }
}

export function isCommerceItemPurchasable(item, capability = PAYMENTS_CAPABILITY) {
  return paymentsCapabilityVerified(capability)
    && commerceItemVerified(item)
    && item?.active === true
    && item.release?.deployApproved === true;
}

function commerceItemVerified(item) {
  const common = item != null
    && Number.isInteger(item.amountCents)
    && item.amountCents > 0
    && item.quickBooks?.itemVerified === true
    && typeof item.quickBooks?.itemId === 'string'
    && item.quickBooks.itemId.length > 0
    && item.quickBooks?.itemName === item.name
    && item.tax?.classificationApproved === true
    && taxGatePassed(item)
    && typeof item.tax?.quickBooksTaxCode === 'string'
    && /^[A-Za-z0-9._:-]{1,32}$/.test(item.tax.quickBooksTaxCode)
    && item.release?.ownerPilotApproved === true
    && item.release?.priceApproved === true;
  if (!common) return false;
  if (isServiceBookingOffer(item)) return isAllowedBookingUrl(item.booking?.url);
  return item.fulfillmentType === 'protected_download'
    && item.tax?.accountantVerified === true
    && item.artifact?.contentType === 'application/pdf'
    && Number.isSafeInteger(item.artifact?.exactBytes)
    && item.artifact.exactBytes > 0
    && typeof item.artifact?.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(item.artifact.sha256)
    && typeof item.artifact?.md5Hash === 'string'
    && /^[A-Za-z0-9+/]{22}==$/.test(item.artifact.md5Hash)
    && typeof item.artifact?.generation === 'string'
    && /^[1-9][0-9]{0,30}$/.test(item.artifact.generation)
    && item.artifact?.objectVerified === true
    && item.release?.fulfillmentRuntimeVerified === true;
}

export {commerceItemVerified};

function exactReviewedPaymentsCapability(capability) {
  return capability?.mode === 'documented-intuit-flow' && paymentsCapabilityVerified(capability);
}

export function isControlledOwnerPilotReady({flags,capability,item,fulfillmentAvailable} = {}) {
  return flags?.controlledOwnerPilotEnabled === true
    && flags?.publicAuthResumeEnabled === false
    && flags?.publicDigitalCheckoutEnabled === false
    && flags?.serviceQboSendEnabled === false
    && fulfillmentAvailable === true
    && exactReviewedPaymentsCapability(capability)
    && commerceItemVerified(item)
    && item.release?.ownerPilotApproved === true;
}

export function isPublicCommerceActivationReady({flags,capability,item,fulfillmentAvailable} = {}) {
  return flags?.publicAuthResumeEnabled === true
    && flags?.publicDigitalCheckoutEnabled === true
    && flags?.controlledOwnerPilotEnabled === false
    && flags?.serviceQboSendEnabled === false
    && fulfillmentAvailable === true
    && exactReviewedPaymentsCapability(capability)
    && isCommerceItemPurchasable(item,capability);
}

export function getConfiguredPaymentsCapability() {
  return PAYMENTS_CAPABILITY;
}

export function getConfiguredCommerceItem(sku) {
  return resolveItem(sku);
}

export function getCommerceItem(sku) {
  const item = resolveItem(sku);

  if (!isCommerceItemPurchasable(item)) {
    throw new Error('Commerce item is unavailable');
  }

  return item;
}

export function listPublicCommerceItems() {
  return Object.freeze(allItems().filter(item => isCommerceItemPurchasable(item)));
}

export function listCommerceCapabilities() {
  return Object.freeze(allItems().map(item => Object.freeze({
    sku:item.sku,
    active:isCommerceItemPurchasable(item),
    display:Object.freeze({
      name:item.name,
      amountCents:item.amountCents,
      currency:item.currency,
      invoiceProvider:'quickbooks',
      paymentMethods:INVOICE_PAYMENT_METHODS,
      delivery:isServiceBookingOffer(item) ? 'post_payment_booking' : 'protected_electronic_delivery',
    }),
  })));
}

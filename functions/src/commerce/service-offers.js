// Paid service offers sold through QuickBooks Online and fulfilled by a post-payment booking link.
// Fail-closed: an offer is purchasable only when every gate below is true. Nothing here charges,
// invoices, or emails anyone.

const CALENDLY_ORIGIN = 'https://calendly.com';
const ALLOWED_BOOKING_PATHS = Object.freeze(['/ballerskingdom/30min']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const STRATEGY_SESSION_SKU = 'strategy-session-30';

export const STRATEGY_SESSION_QBO_ITEM_SPEC = deepFreeze({
  name: 'Ballers Kingdom Strategy Session (30 min)',
  type: 'Service',
  unitPrice: 100,
  currency: 'USD',
  incomeAccountName: 'Services',
  // Owner decision 2026-10-15: client pays exactly $100 total, tax included. US QBO companies on
  // automated sales tax cannot use tax-inclusive (GlobalTaxCalculation=TaxInclusive) pricing, so the
  // item is non-taxable at $100 and the tax treatment is flagged for accountant review.
  taxable: false,
  description: 'Paid 30-minute Ballers Kingdom strategy/consulting session. Booked via Calendly after payment.',
});

// The offer rides the existing QuickBooks digital-order pipeline (invoice create/send, exact payment
// verification, reconciliation). "Fulfillment" is releasing the allowlisted booking link after the
// order is fulfilled; there is no protected download.
const OFFERS = deepFreeze({
  [STRATEGY_SESSION_SKU]: {
    sku: STRATEGY_SESSION_SKU,
    name: STRATEGY_SESSION_QBO_ITEM_SPEC.name,
    amountCents: 10000,
    currency: 'USD',
    offerKind: 'service',
    orderType: 'digital_product',
    fulfillmentType: 'post_payment_booking',
    delivery: 'post_payment_booking',
    physicalCopyIncluded: false,
    active: true,
    quickBooks: {
      itemName: STRATEGY_SESSION_QBO_ITEM_SPEC.name,
      itemId: null, // supplied at runtime only from the verified ensureStrategySessionItem readback
      itemVerified: false,
      runtimeVerifiable: true,
    },
    tax: {
      classification: 'flat_100_total_tax_included_owner_approved_pending_accountant',
      quickBooksTaxCode: 'NON',
      totalIsTaxInclusive: true,
      classificationApproved: true,
      ownerApproved: true,
      accountantVerified: false,
      reviewStatus: 'pending_accountant_review',
    },
    booking: {
      provider: 'calendly',
      url: 'https://calendly.com/ballerskingdom/30min',
    },
    release: {ownerPilotApproved: true, priceApproved: true, deployApproved: true},
  },
});

export function listServiceOffers() {
  return Object.values(OFFERS);
}

export function isAllowedBookingUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.origin === CALENDLY_ORIGIN
      && ALLOWED_BOOKING_PATHS.includes(parsed.pathname)
      && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

export function getServiceOffer(sku) {
  return OFFERS[String(sku || '')] ?? null;
}

export function isServiceBookingOffer(item) {
  return item?.offerKind === 'service' && item?.fulfillmentType === 'post_payment_booking';
}

// Service offers may pass with owner approval while accountant review is pending. Every other item
// (digital downloads such as the Study Guide) still requires accountantVerified === true.
export function taxGatePassed(item) {
  if (item?.tax?.accountantVerified === true) return true;
  return isServiceBookingOffer(item) && item.tax?.classificationApproved === true
    && item.tax.ownerApproved === true
    && item.tax.reviewStatus === 'pending_accountant_review';
}

// Returns the booking link only for a fulfilled order (fulfillment happens only after exact
// QuickBooks payment verification).
export function getPostPaymentBookingUrl(order) {
  if (!order || order.fulfillmentType !== 'post_payment_booking' || order.status !== 'fulfilled') return null;
  const offer = getServiceOffer(order.sku);
  if (!offer || !isAllowedBookingUrl(offer.booking?.url)) return null;
  return offer.booking.url;
}

// Verifies a normalized QuickBooks Item readback against the approved spec.
export function assertServiceItemReadback(item, spec = STRATEGY_SESSION_QBO_ITEM_SPEC) {
  const problems = [];
  if (!item || typeof item.itemId !== 'string' || item.itemId === '') problems.push('itemId');
  if (item?.name !== spec.name) problems.push('name');
  if (item?.type !== spec.type) problems.push('type');
  if (item?.active !== true) problems.push('active');
  if (Number(item?.unitPrice) !== spec.unitPrice) problems.push('unitPrice');
  if (item?.incomeAccountName !== spec.incomeAccountName) problems.push('incomeAccount');
  if (item?.taxable !== spec.taxable) problems.push('taxable');
  if (problems.length) {
    const error = new Error(`QuickBooks service item readback mismatch: ${problems.join(',')}`);
    error.code = 'QBO_ITEM_MISMATCH';
    throw error;
  }
  return item;
}

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
  unitPrice: 97,
  currency: 'USD',
  incomeAccountName: 'Services',
  taxable: true, // owner decision 2026-10-15: tax charged on top via QBO automated sales tax
  description: 'Paid 30-minute Ballers Kingdom strategy/consulting session. Booked via Calendly after payment.',
});

const OFFERS = deepFreeze({
  [STRATEGY_SESSION_SKU]: {
    sku: STRATEGY_SESSION_SKU,
    name: STRATEGY_SESSION_QBO_ITEM_SPEC.name,
    amountCents: 9700,
    currency: 'USD',
    orderType: 'service',
    fulfillmentType: 'post_payment_booking',
    active: false,
    quickBooks: {
      itemName: STRATEGY_SESSION_QBO_ITEM_SPEC.name,
      itemId: null, // set only after ensureStrategySessionItem readback is verified
      itemVerified: false,
    },
    tax: {
      classification: 'taxable_qbo_automated_sales_tax_owner_approved_pending_accountant',
      quickBooksTaxCode: 'TAX',
      chargedOnTopOfPrice: true,
      classificationApproved: true,
      accountantVerified: false,
    },
    booking: {
      provider: 'calendly',
      url: 'https://calendly.com/ballerskingdom/30min',
    },
    release: {priceApproved: true, deployApproved: false},
  },
});

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

export function isServiceOfferPurchasable(offer, {publicCheckoutEnabled = false} = {}) {
  return publicCheckoutEnabled === true
    && offer != null
    && offer.active === true
    && offer.release?.deployApproved === true
    && offer.release?.priceApproved === true
    && Number.isInteger(offer.amountCents) && offer.amountCents > 0
    && offer.quickBooks?.itemVerified === true
    && typeof offer.quickBooks?.itemId === 'string' && offer.quickBooks.itemId.length > 0
    && offer.quickBooks?.itemName === offer.name
    && offer.tax?.classificationApproved === true
    && offer.tax?.accountantVerified === true
    && isAllowedBookingUrl(offer.booking?.url);
}

const PAID_STATUSES = new Set(['paid', 'fulfilled']);

// Returns the booking link only for an order whose QuickBooks payment was independently verified.
export function getPostPaymentBookingUrl(order) {
  if (!order || order.fulfillmentType !== 'post_payment_booking') return null;
  if (!PAID_STATUSES.has(order.status)) return null;
  if (order.payment?.verified !== true) return null;
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

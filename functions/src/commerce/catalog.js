const ITEMS = Object.freeze({
  'home-inspection-study-guide': Object.freeze({
    sku: 'home-inspection-study-guide',
    name: 'Home Inspection Study Guide',
    amountCents: 0,
    currency: 'USD',
    orderType: 'digital_product',
    fulfillmentType: 'protected_download',
    active: false
  })
});

function isPurchasable(item) {
  return item?.active === true
    && Number.isInteger(item.amountCents)
    && item.amountCents > 0;
}

export function getCommerceItem(sku) {
  const item = ITEMS[String(sku || '')];

  if (!isPurchasable(item)) {
    throw new Error('Commerce item is unavailable');
  }

  return item;
}

export function listPublicCommerceItems() {
  return Object.freeze(Object.values(ITEMS).filter(isPurchasable));
}

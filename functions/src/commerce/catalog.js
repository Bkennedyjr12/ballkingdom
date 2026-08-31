function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const ITEMS = deepFreeze({
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
      classification: 'ca_electronic_only_non_taxable_proposed',
      quickBooksTaxCode: 'NON',
      classificationApproved: true,
      accountantVerified: false,
      scope: 'California electronic-only delivery with no tangible copy or storage media',
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
      fulfillmentRuntimeVerified: false,
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

export function isCommerceItemPurchasable(item) {
  return item?.active === true
    && Number.isInteger(item.amountCents)
    && item.amountCents > 0
    && item.quickBooks?.itemVerified === true
    && typeof item.quickBooks?.itemId === 'string'
    && item.quickBooks.itemId.length > 0
    && item.quickBooks?.itemName === item.name
    && item.tax?.classificationApproved === true
    && item.tax?.accountantVerified === true
    && typeof item.tax?.quickBooksTaxCode === 'string'
    && /^[A-Za-z0-9._:-]{1,32}$/.test(item.tax.quickBooksTaxCode)
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
    && item.release?.ownerPilotApproved === true
    && item.release?.priceApproved === true
    && item.release?.fulfillmentRuntimeVerified === true
    && item.release?.deployApproved === true;
}

export function getConfiguredCommerceItem(sku) {
  return ITEMS[String(sku || '')] ?? null;
}

export function getCommerceItem(sku) {
  const item = ITEMS[String(sku || '')];

  if (!isCommerceItemPurchasable(item)) {
    throw new Error('Commerce item is unavailable');
  }

  return item;
}

export function listPublicCommerceItems() {
  return Object.freeze(Object.values(ITEMS).filter(isCommerceItemPurchasable));
}

export function listCommerceCapabilities() {
  return Object.freeze(Object.values(ITEMS).map(item => Object.freeze({
    sku:item.sku,
    active:isCommerceItemPurchasable(item),
  })));
}

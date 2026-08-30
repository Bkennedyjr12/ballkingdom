const PRODUCTS = Object.freeze([
  Object.freeze({
    slug: 'sba-ready-business-acquisition-toolkit',
    eyebrow: 'Business acquisition',
    name: 'SBA-Ready Business Acquisition Toolkit',
    summary: 'A practical playbook for finding, evaluating, financing, and buying an operating small business—not another job.',
    delivery: 'instant-download',
    availability: 'coming-soon',
    priceLabel: 'Founding price to be announced',
    href: 'products.html#sba-ready-business-acquisition-toolkit',
    cta: 'Get the Acquisition Toolkit',
    disclaimer: 'Educational screening tools only. Financing and transaction outcomes are not guaranteed.'
  }),
  Object.freeze({
    slug: 'home-inspection-study-guide',
    eyebrow: 'Professional learning',
    name: 'Home Inspection Study Guide',
    summary: 'A structured visual study guide for learning inspection systems, field observations, report language, and practical next steps.',
    delivery: 'instant-download',
    availability: 'coming-soon',
    commerceSku: 'home-inspection-study-guide',
    priceLabel: 'Price to be announced',
    href: 'products.html#home-inspection-study-guide',
    cta: 'Get the Home Inspection Guide',
    disclaimer: 'Learning resource only; it does not replace licensing requirements, supervised field experience, or professional judgment.'
  }),
  Object.freeze({
    slug: 'personalized-career-opportunity-blueprint',
    eyebrow: 'Career navigation',
    name: 'Personalized Career Opportunity Blueprint',
    summary: 'Start with a free Career Opportunity Snapshot, then unlock a tailored action plan with source-linked roles and professional opportunities.',
    delivery: 'personalized-digital',
    availability: 'free-intake-preview',
    priceLabel: 'Free Snapshot · Blueprint price to be announced',
    href: 'career-blueprint.html',
    cta: 'Build My Free Career Snapshot',
    disclaimer: 'Opportunity availability changes. No interview, introduction, employment, compensation, or outcome is guaranteed.'
  }),
  Object.freeze({
    slug: 'career-strategy-network-navigation',
    eyebrow: 'Human strategy',
    name: 'Career Strategy & Network Navigation',
    summary: 'A tailored human review delivered within five business days after payment and receipt of all required information.',
    delivery: 'human-service',
    availability: 'coming-soon',
    priceLabel: 'Price to be announced',
    href: 'career-blueprint.html#human-service',
    cta: 'Explore Human Support',
    disclaimer: 'Introductions may be considered when relevant and available; they are not guaranteed.'
  })
]);

function getProductBySlug(slug) {
  return PRODUCTS.find((product) => product.slug === slug) || null;
}

function getPrimaryProducts() {
  return PRODUCTS.filter((product) => product.slug !== 'career-strategy-network-navigation');
}

export { PRODUCTS, getProductBySlug, getPrimaryProducts };

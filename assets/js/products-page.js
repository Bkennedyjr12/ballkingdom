import { getPrimaryProducts } from './product-catalog.js';

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function renderProductCard(product) {
  const state = product.availability === 'free-intake-preview' ? 'Free preview' : 'Secure checkout coming soon';
  const commerce = product.commerceSku ? ` data-commerce-sku="${escapeHtml(product.commerceSku)}" aria-disabled="true"` : '';
  const href = product.commerceSku ? 'products.html#home-inspection-study-guide' : product.href;
  return `<article class="product-offer" id="${escapeHtml(product.slug)}">
    <p class="product-offer__eyebrow">${escapeHtml(product.eyebrow)}</p>
    <h2>${escapeHtml(product.name)}</h2>
    <p>${escapeHtml(product.summary)}</p>
    <p class="product-offer__price">${escapeHtml(product.priceLabel)}</p>
    <p class="product-offer__state">${escapeHtml(state)}</p>
    <a class="btn btn-primary${product.commerceSku ? ' btn-disabled' : ''}" href="${escapeHtml(href)}"${commerce}>${escapeHtml(product.cta)}</a>
    <p class="product-offer__disclaimer">${escapeHtml(product.disclaimer)}</p>
  </article>`;
}

const grid = document.querySelector('[data-product-grid]');
if (grid) grid.innerHTML = getPrimaryProducts().map(renderProductCard).join('');

async function applyCommerceAvailability() {
  const controls = [...document.querySelectorAll('[data-commerce-sku]')];
  if (!controls.length) return;
  controls.forEach(control => control.addEventListener('click', event => {
    if (control.getAttribute('aria-disabled') === 'true') event.preventDefault();
  }));
  const boundary = window.__BALLERS_COMMERCE__;
  const unavailable = control => control.insertAdjacentHTML('afterend','<span class="commerce-unavailable" role="status">Purchasing is temporarily unavailable</span>');
  if (!boundary || typeof boundary.getReleaseState !== 'function') { controls.forEach(unavailable); return; }
  try {
    const release = await boundary.getReleaseState();
    const products = Array.isArray(release?.products) ? release.products : [];
    controls.forEach(control => {
      const active = products.some(item => item && item.sku === control.dataset.commerceSku && item.active === true && Object.keys(item).every(key => ['sku','active'].includes(key)));
      if (!active) { unavailable(control); return; }
      control.href = `order-status.html?sku=${encodeURIComponent(control.dataset.commerceSku)}`;
      control.classList.remove('btn-disabled');
      control.removeAttribute('aria-disabled');
    });
  } catch { controls.forEach(unavailable); }
}

applyCommerceAvailability();

export { renderProductCard, applyCommerceAvailability };

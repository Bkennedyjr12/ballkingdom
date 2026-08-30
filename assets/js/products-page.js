import { getPrimaryProducts } from './product-catalog.js';

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function renderProductCard(product) {
  const state = product.availability === 'free-intake-preview' ? 'Free preview' : 'Secure checkout coming soon';
  return `<article class="product-offer" id="${escapeHtml(product.slug)}">
    <p class="product-offer__eyebrow">${escapeHtml(product.eyebrow)}</p>
    <h2>${escapeHtml(product.name)}</h2>
    <p>${escapeHtml(product.summary)}</p>
    <p class="product-offer__price">${escapeHtml(product.priceLabel)}</p>
    <p class="product-offer__state">${escapeHtml(state)}</p>
    <a class="btn btn-primary" href="${escapeHtml(product.href)}">${escapeHtml(product.cta)}</a>
    <p class="product-offer__disclaimer">${escapeHtml(product.disclaimer)}</p>
  </article>`;
}

const grid = document.querySelector('[data-product-grid]');
if (grid) grid.innerHTML = getPrimaryProducts().map(renderProductCard).join('');

export { renderProductCard };

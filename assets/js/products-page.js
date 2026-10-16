import { getPrimaryProducts } from './product-catalog.js';
import { getCommerceBoundary, validateCapabilityResponse } from './commerce-client.js';

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function renderProductCard(product) {
  const state = product.availability === 'free-intake-preview' ? 'Free preview' : 'Secure checkout coming soon';
  const commerce = product.commerceSku ? ` data-commerce-sku="${escapeHtml(product.commerceSku)}" aria-disabled="true"` : '';
  const href = product.commerceSku ? 'products.html#home-inspection-study-guide' : product.href;
  const commerceName = product.commerceSku ? ' data-commerce-product-name' : '';
  const commercePrice = product.commerceSku ? ' data-commerce-product-price' : '';
  const unlisted = product.slug === 'home-inspection-study-guide' ? ' data-unlisted' : '';
  return `<article class="product-offer"${unlisted} id="${escapeHtml(product.slug)}">
    <p class="product-offer__eyebrow">${escapeHtml(product.eyebrow)}</p>
    <h2${commerceName}>${escapeHtml(product.name)}</h2>
    <p>${escapeHtml(product.summary)}</p>
    <p class="product-offer__price"${commercePrice}>${escapeHtml(product.priceLabel)}</p>
    <p class="product-offer__state">${escapeHtml(state)}</p>
    <a class="btn btn-primary${product.commerceSku ? ' btn-disabled' : ''}" href="${escapeHtml(href)}"${commerce}>${escapeHtml(product.cta)}</a>
    <p class="product-offer__disclaimer">${escapeHtml(product.disclaimer)}</p>
  </article>`;
}

const grid = document.querySelector('[data-product-grid]');
if (grid) grid.innerHTML = getPrimaryProducts().map(renderProductCard).join('');

function focusLinkedProduct() {
  if (!grid || !location.hash) return;
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const card = document.getElementById(id);
  if (!card || !grid.contains(card) || !card.classList.contains('product-offer')) return;
  card.scrollIntoView({ block: 'start', behavior: 'instant' });
  const heading = card.querySelector('h2');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
focusLinkedProduct();
window.addEventListener('hashchange', focusLinkedProduct);

async function applyCommerceAvailability() {
  const controls = [...document.querySelectorAll('[data-commerce-sku]')];
  if (!controls.length) return;
  controls.forEach(control => control.addEventListener('click', event => {
    if (control.getAttribute('aria-disabled') === 'true') event.preventDefault();
  }));
  const boundary = await getCommerceBoundary();
  const unavailable = control => {
    const state = control.closest('.product-offer')?.querySelector('.product-offer__state');
    if (state) { state.textContent = 'Purchasing is temporarily unavailable'; state.setAttribute('role', 'status'); }
  };
  if (!boundary) { controls.forEach(unavailable); return; }
  try {
    const release = validateCapabilityResponse(await boundary.getBuyerCommerceCapability());
    const products = release.products;
    controls.forEach(control => {
      const product = products.find(item => item.sku === control.dataset.commerceSku);
      if (!product) { unavailable(control); return; }
      const card=control.closest('.product-offer');
      const name=card?.querySelector('[data-commerce-product-name]');
      const price=card?.querySelector('[data-commerce-product-price]');
      if(name)name.textContent=product.display.name;
      if(price)price.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:product.display.currency}).format(product.display.amountCents/100);
      if (!product.active) { unavailable(control); return; }
      const state = card?.querySelector('.product-offer__state');
      if (state) state.textContent = 'Available now';
      control.href = `order-status.html?sku=${encodeURIComponent(control.dataset.commerceSku)}`;
      control.classList.remove('btn-disabled');
      control.removeAttribute('aria-disabled');
    });
  } catch { controls.forEach(unavailable); }
}

applyCommerceAvailability();

export { renderProductCard, applyCommerceAvailability };

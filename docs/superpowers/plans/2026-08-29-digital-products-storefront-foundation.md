# Digital Products Storefront Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-quality Ballers Kingdom digital-products storefront and career-funnel landing experience without accepting payments, collecting resumes, or exposing protected files before the secure backend exists.

**Architecture:** Extend the existing dependency-light static site with three focused pages and a shared product data module. Render product details and availability states from one catalog, preserve the existing black Ballers Kingdom visual language, and route career visitors to a transparent preview of the forthcoming secure intake. Keep every purchase control fail-closed until QuickBooks and Firebase are verified in later phases.

**Tech Stack:** Semantic HTML5, existing CSS custom properties, vanilla ES modules, Node.js built-in test runner, Playwright, GitHub Pages-compatible static assets.

**Spec:** `docs/superpowers/specs/2026-08-29-digital-products-career-opportunity-funnel-design.md`

## Global Constraints

- Preserve the current uncommitted Home Inspection Guide changes and do not stage or alter them unless a task explicitly names the file.
- No outbound message, QuickBooks transaction, public deployment, production Firebase write, or network introduction without Brian's explicit approval.
- Do not expose the existing Home Inspection Guide PDF through a new storefront link.
- Every product page must clarify deliverables, delivery mode, limitations, and whether checkout is available.
- Career copy must not guarantee introductions, interviews, employment, compensation, or opportunity availability.
- The human service promises five business days beginning after payment and receipt of all required information.
- Purchase controls remain fail-closed until server-side QuickBooks verification and protected delivery exist.
- Preserve mobile navigation, keyboard access, reduced-motion behavior, and current Ballers Kingdom branding.
- Do not add a framework or client-side dependency for this phase.

## File Structure

- Create `assets/js/product-catalog.js` — canonical public product metadata and safe availability states.
- Create `assets/js/products-page.js` — renders catalog cards into approved page containers.
- Create `products.html` — Digital Products & Personalized Solutions catalog.
- Create `career-blueprint.html` — career funnel explanation, free Snapshot preview, paid Blueprint preview, and premium-service offer.
- Create `custom-solutions.html` — custom-service positioning and inquiry route.
- Create `tests/product-catalog.test.mjs` — catalog schema, copy, availability, and route tests.
- Create `tests/storefront-html.test.mjs` — semantic-page, protected-link, navigation, metadata, and disclaimer tests.
- Create `tests/storefront-browser.spec.mjs` — desktop/mobile navigation and product rendering smoke tests.
- Modify `assets/css/styles.css` — shared storefront visual system and responsive rules.
- Modify `index.html` — homepage entry point and navigation.
- Modify `shop.html` — separate apparel preview from digital products and add the storefront route.
- Modify `sitemap.xml` — advertise the three new public routes.
- Modify `package.json` — add deterministic storefront test scripts.
- Modify `README.md` — document storefront status and later-phase gates.

---

### Task 1: Canonical Product Catalog

**Files:**
- Create: `assets/js/product-catalog.js`
- Create: `tests/product-catalog.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: no earlier task interface.
- Produces: `PRODUCTS: readonly Product[]`, `getProductBySlug(slug): Product | null`, and `getPrimaryProducts(): Product[]`.

`Product` has this public shape:

```js
{
  slug: string,
  eyebrow: string,
  name: string,
  summary: string,
  delivery: 'instant-download' | 'personalized-digital' | 'human-service',
  availability: 'coming-soon' | 'free-intake-preview',
  priceLabel: string,
  href: string,
  cta: string,
  disclaimer: string
}
```

- [ ] **Step 1: Add the catalog schema and copy tests**

Create `tests/product-catalog.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, getProductBySlug, getPrimaryProducts } from '../assets/js/product-catalog.js';

test('catalog exposes the three approved primary products and human service', () => {
  assert.deepEqual(PRODUCTS.map(({ slug }) => slug), [
    'sba-ready-business-acquisition-toolkit',
    'home-inspection-study-guide',
    'personalized-career-opportunity-blueprint',
    'career-strategy-network-navigation'
  ]);
  assert.equal(getPrimaryProducts().length, 3);
});

test('all commerce states fail closed before payment integration', () => {
  for (const product of PRODUCTS) {
    assert.ok(['coming-soon', 'free-intake-preview'].includes(product.availability));
    assert.doesNotMatch(product.href, /guide\.pdf|quickbooks|intuit/i);
  }
});

test('approved names and five-business-day promise are exact', () => {
  assert.equal(getProductBySlug('personalized-career-opportunity-blueprint').name, 'Personalized Career Opportunity Blueprint');
  const human = getProductBySlug('career-strategy-network-navigation');
  assert.equal(human.name, 'Career Strategy & Network Navigation');
  assert.match(human.summary, /five business days/i);
  assert.match(human.disclaimer, /not guaranteed/i);
});

test('unknown slugs return null', () => {
  assert.equal(getProductBySlug('missing'), null);
});
```

- [ ] **Step 2: Add the test command and verify the test fails**

Add to `package.json` scripts:

```json
"test:storefront:unit": "node --test tests/product-catalog.test.mjs tests/storefront-html.test.mjs",
"test:storefront:browser": "playwright test tests/storefront-browser.spec.mjs",
"test:storefront": "npm run test:storefront:unit && npm run test:storefront:browser"
```

Run: `npm run test:storefront:unit`

Expected: FAIL because `assets/js/product-catalog.js` and `tests/storefront-html.test.mjs` do not exist yet. For this step, run the single file directly instead:

Run: `node --test tests/product-catalog.test.mjs`

Expected: FAIL with module-not-found for `product-catalog.js`.

- [ ] **Step 3: Implement the product catalog**

Create `assets/js/product-catalog.js` with exactly four immutable product objects. Use these approved action labels:

```js
const PRODUCTS = Object.freeze([
  Object.freeze({
    slug: 'sba-ready-business-acquisition-toolkit',
    eyebrow: 'Business acquisition',
    name: 'SBA-Ready Business Acquisition Toolkit',
    summary: 'A practical playbook for finding, evaluating, financing, and buying an operating small business—not another job.',
    delivery: 'instant-download',
    availability: 'coming-soon',
    priceLabel: 'Founding price to be announced',
    href: 'products.html#acquisition-toolkit',
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
    priceLabel: 'Price to be announced',
    href: 'products.html#home-inspection-guide',
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
```

- [ ] **Step 4: Run the focused catalog tests**

Run: `node --test tests/product-catalog.test.mjs`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the catalog unit**

```bash
git add package.json assets/js/product-catalog.js tests/product-catalog.test.mjs
git commit -m "feat: define digital product catalog"
```

---

### Task 2: Digital Products Catalog Page

**Files:**
- Create: `products.html`
- Create: `assets/js/products-page.js`
- Create: `tests/storefront-html.test.mjs`
- Modify: `assets/css/styles.css`

**Interfaces:**
- Consumes: `getPrimaryProducts()` and `getProductBySlug()` from Task 1.
- Produces: `[data-product-grid]`, `renderProductCard(product): string`, and public anchors `#acquisition-toolkit`, `#home-inspection-guide`, `#career-blueprint`, and `#custom-solutions`.

- [ ] **Step 1: Write page-contract tests**

Create `tests/storefront-html.test.mjs` with helpers that read files through `node:fs/promises`. Add tests asserting:

```js
test('products page contains the approved catalog entry points', async () => {
  const html = await read('products.html');
  for (const value of ['Digital Products & Personalized Solutions', 'data-product-grid', 'custom-solutions.html']) {
    assert.match(html, new RegExp(escapeRegExp(value)));
  }
});

test('storefront does not expose protected PDFs or pretend checkout is active', async () => {
  const html = await read('products.html');
  assert.doesNotMatch(html, /href=["'][^"']*\.pdf/i);
  assert.doesNotMatch(html, /quickbooks|intuit|payment successful|buy now/i);
});

test('storefront has one h1 and a main landmark', async () => {
  const html = await read('products.html');
  assert.equal((html.match(/<h1\b/gi) || []).length, 1);
  assert.match(html, /<main\b/i);
});
```

Include reusable `read(path)` and `escapeRegExp(value)` functions in the test file.

- [ ] **Step 2: Verify page-contract tests fail**

Run: `node --test tests/storefront-html.test.mjs`

Expected: FAIL because `products.html` does not exist.

- [ ] **Step 3: Build the semantic catalog page**

Create `products.html` using the existing nav/footer structure and shared assets. Required sections:

- Hero thesis: **Practical playbooks. Personalized next moves.**
- Three-product grid container: `<div class="product-offer-grid" data-product-grid></div>`.
- “How delivery works” section distinguishing instant, personalized, and human-reviewed products.
- Custom Solutions callout linking to `custom-solutions.html`.
- Honest launch notice stating secure checkout is being connected and no payment is collected on the current page.

Use `type="module"` to load `assets/js/products-page.js` after `assets/js/main.js`.

- [ ] **Step 4: Implement safe catalog rendering**

Create `assets/js/products-page.js`:

```js
import { getPrimaryProducts } from './product-catalog.js';

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function renderProductCard(product) {
  const state = product.availability === 'free-intake-preview' ? 'Free preview' : 'Checkout coming soon';
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
```

- [ ] **Step 5: Add the storefront design system**

Append focused selectors to `assets/css/styles.css` for:

- `.products-hero`, `.product-offer-grid`, `.product-offer`
- `.product-offer__eyebrow`, `.product-offer__price`, `.product-offer__state`, `.product-offer__disclaimer`
- `.delivery-ledger`, `.delivery-ledger__item`, `.custom-solutions-band`

Use existing `--black`, `--charcoal`, `--stone`, `--white`, and `--gold` variables. The signature element is a restrained “playbook route” rule that visually connects the product cards on desktop and becomes a vertical progress line on mobile. Respect `prefers-reduced-motion` and maintain visible `:focus-visible` styles.

- [ ] **Step 6: Run unit and page-contract tests**

Run: `npm run test:storefront:unit`

Expected: all catalog and HTML tests PASS.

- [ ] **Step 7: Commit the catalog page**

```bash
git add products.html assets/js/products-page.js assets/css/styles.css tests/storefront-html.test.mjs
git commit -m "feat: add digital products storefront"
```

---

### Task 3: Career Funnel Landing and Free Snapshot Preview

**Files:**
- Create: `career-blueprint.html`
- Modify: `tests/storefront-html.test.mjs`
- Modify: `assets/css/styles.css`

**Interfaces:**
- Consumes: approved career product names and availability states from Task 1.
- Produces: public anchors `#free-snapshot`, `#paid-blueprint`, and `#human-service`; a disabled `[data-career-intake-pending]` control for Phase 2 replacement.

- [ ] **Step 1: Add career-page contract tests**

Extend `tests/storefront-html.test.mjs`:

```js
test('career page explains the complete value ladder', async () => {
  const html = await read('career-blueprint.html');
  for (const value of [
    'Career Opportunity Snapshot',
    'Personalized Career Opportunity Blueprint',
    'Career Strategy &amp; Network Navigation',
    'five business days',
    'not guaranteed'
  ]) assert.match(html, new RegExp(escapeRegExp(value), 'i'));
});

test('career intake remains fail closed until Phase 2', async () => {
  const html = await read('career-blueprint.html');
  assert.match(html, /data-career-intake-pending/);
  assert.match(html, /aria-disabled=["']true["']/);
  assert.doesNotMatch(html, /<input[^>]+type=["']file["']/i);
  assert.doesNotMatch(html, /quickbooks|intuit|\.pdf/i);
});
```

- [ ] **Step 2: Verify the new tests fail**

Run: `node --test tests/storefront-html.test.mjs`

Expected: FAIL because `career-blueprint.html` does not exist.

- [ ] **Step 3: Build the career funnel page**

Create `career-blueprint.html` with:

- Hero: **Turn your experience into a clear opportunity strategy.**
- A six-step intake preview: starting point, resume and experience, preferences, practical requirements, direction, privacy consent.
- Free Snapshot sample structure with no fabricated person or opportunity.
- Paid Blueprint locked-section preview.
- Human-service section with the five-business-day promise.
- Exact disclaimer: “Introductions may be considered when relevant, appropriate, and available. Introductions, interviews, employment, compensation, and other outcomes are not guaranteed.”
- A non-interactive control labeled **Secure intake coming soon** with `aria-disabled="true"` and `data-career-intake-pending`.
- A custom-solution route for visitors whose needs do not fit the standard Blueprint.

- [ ] **Step 4: Style the funnel as an intentional playbook path**

Add `.career-route`, `.career-route__step`, `.snapshot-sheet`, `.blueprint-locks`, `.blueprint-lock`, `.human-service-panel`, and `.availability-note` to `assets/css/styles.css`. Keep the page calm and readable; use one connected route line as the signature rather than decorative gradients.

- [ ] **Step 5: Run page-contract tests**

Run: `npm run test:storefront:unit`

Expected: all tests PASS.

- [ ] **Step 6: Commit the career landing page**

```bash
git add career-blueprint.html assets/css/styles.css tests/storefront-html.test.mjs
git commit -m "feat: add career opportunity funnel landing page"
```

---

### Task 4: Custom Solutions Page

**Files:**
- Create: `custom-solutions.html`
- Modify: `tests/storefront-html.test.mjs`
- Modify: `assets/css/styles.css`

**Interfaces:**
- Consumes: existing `contact.html` consultation route.
- Produces: a public custom-solutions explanation and safe inquiry CTA linking to `contact.html?interest=custom-solution`.

- [ ] **Step 1: Add custom-page tests**

Extend `tests/storefront-html.test.mjs`:

```js
test('custom solutions page states scope and avoids promises', async () => {
  const html = await read('custom-solutions.html');
  assert.match(html, /customized guides, reports, and opportunity maps/i);
  assert.match(html, /scope, price, timeline, and feasibility/i);
  assert.match(html, /contact\.html\?interest=custom-solution/);
  assert.doesNotMatch(html, /guaranteed results|we can build anything/i);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test tests/storefront-html.test.mjs`

Expected: FAIL because `custom-solutions.html` does not exist.

- [ ] **Step 3: Build the custom-solutions page**

Create `custom-solutions.html` with three clearly bounded categories:

1. Personalized learning guides
2. Research and opportunity maps
3. Decision-support playbooks and toolkits

Explain the process as discovery, scoped proposal, source collection, build, and review. State that scope, price, timeline, and feasibility are confirmed only after review. Link to `contact.html?interest=custom-solution`; do not create or send an email automatically.

- [ ] **Step 4: Add restrained custom-service styles**

Add `.solution-capabilities`, `.solution-capability`, and `.solution-process` to `assets/css/styles.css`, reusing the storefront spacing and focus rules.

- [ ] **Step 5: Run storefront unit tests**

Run: `npm run test:storefront:unit`

Expected: all tests PASS.

- [ ] **Step 6: Commit the custom-solutions page**

```bash
git add custom-solutions.html assets/css/styles.css tests/storefront-html.test.mjs
git commit -m "feat: add custom solutions inquiry path"
```

---

### Task 5: Site Navigation, Homepage Entry Point, and Metadata

**Files:**
- Modify: `index.html`
- Modify: `shop.html`
- Modify: `sitemap.xml`
- Modify: `tests/storefront-html.test.mjs`

**Interfaces:**
- Consumes: public routes from Tasks 2–4.
- Produces: discoverable `products.html` navigation and homepage entry point.

- [ ] **Step 1: Add route-discovery tests**

Extend `tests/storefront-html.test.mjs`:

```js
test('primary pages expose the products destination', async () => {
  for (const page of ['index.html', 'shop.html', 'products.html', 'career-blueprint.html', 'custom-solutions.html']) {
    assert.match(await read(page), /href=["']products\.html["']/i, page);
  }
});

test('sitemap includes all public storefront routes', async () => {
  const xml = await read('sitemap.xml');
  for (const route of ['/products.html', '/career-blueprint.html', '/custom-solutions.html']) {
    assert.match(xml, new RegExp(escapeRegExp(route)));
  }
});

test('homepage introduces digital products without claiming checkout is live', async () => {
  const html = await read('index.html');
  assert.match(html, /Digital Products &amp; Personalized Solutions/);
  assert.match(html, /Build My Free Career Snapshot/);
  assert.doesNotMatch(html, /secure checkout is live|buy now/i);
});
```

- [ ] **Step 2: Verify route-discovery tests fail**

Run: `node --test tests/storefront-html.test.mjs`

Expected: FAIL on missing navigation, sitemap URLs, and homepage section.

- [ ] **Step 3: Update navigation and the homepage**

In `index.html`:

- Replace the nav label **Shop** with **Products**, linking to `products.html`.
- Add a homepage section titled **Digital Products & Personalized Solutions** after the Kingdom System section and before the final booking CTA.
- Feature the three primary products with short outcome-led copy.
- Route **Build My Free Career Snapshot** to `career-blueprint.html`.
- Label checkout-dependent products **Secure checkout coming soon**.

In all newly created pages, use the same **Products** navigation label and route.

- [ ] **Step 4: Reframe the apparel page**

In `shop.html`, preserve the apparel preview but add a clearly visible route back to `products.html`. Change the primary navigation label from **Shop** to **Products** and add a secondary **Apparel preview** link within the page. Do not imply apparel checkout is active.

- [ ] **Step 5: Update the sitemap**

Add canonical URLs for:

```xml
<loc>https://ballkingdom.com/products.html</loc>
<loc>https://ballkingdom.com/career-blueprint.html</loc>
<loc>https://ballkingdom.com/custom-solutions.html</loc>
```

Use `2026-08-29` for each new route's `<lastmod>` value.

- [ ] **Step 6: Run storefront unit tests**

Run: `npm run test:storefront:unit`

Expected: all tests PASS.

- [ ] **Step 7: Commit navigation and discovery**

```bash
git add index.html shop.html products.html career-blueprint.html custom-solutions.html sitemap.xml tests/storefront-html.test.mjs
git commit -m "feat: surface digital products across Ballers Kingdom"
```

---

### Task 6: Browser Verification and Operator Documentation

**Files:**
- Create: `tests/storefront-browser.spec.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete public storefront from Tasks 1–5.
- Produces: repeatable desktop/mobile smoke tests and documented Phase 2 handoff.

- [ ] **Step 1: Write Playwright smoke tests**

Create `tests/storefront-browser.spec.mjs`:

```js
import { test, expect } from '@playwright/test';

test('desktop catalog renders three primary offers', async ({ page }) => {
  await page.goto('/products.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Practical playbooks');
  await expect(page.locator('.product-offer')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Build My Free Career Snapshot' })).toBeVisible();
});

test('mobile visitor can reach the career funnel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products.html');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('link', { name: 'Products' })).toBeVisible();
  await page.getByRole('link', { name: 'Build My Free Career Snapshot' }).click();
  await expect(page).toHaveURL(/career-blueprint\.html/);
});

test('career page exposes no file upload or active checkout', async ({ page }) => {
  await page.goto('/career-blueprint.html');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.locator('[data-career-intake-pending]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(/not guaranteed/i)).toBeVisible();
});
```

Add a local `webServer` and `baseURL` configuration in `playwright.config.mjs` only if the repository has no usable configuration at execution time. Use `python3 -m http.server 4173` and `http://127.0.0.1:4173`.

- [ ] **Step 2: Run browser tests and verify the initial configuration failure**

Run: `npm run test:storefront:browser`

Expected: FAIL if Playwright has no base URL/web server configuration; otherwise run against the local server and note any page-contract failure.

- [ ] **Step 3: Add minimal Playwright configuration when required**

If `playwright.config.mjs` does not exist, create it:

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /storefront-browser\.spec\.mjs/,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/products.html',
    reuseExistingServer: true
  }
});
```

- [ ] **Step 4: Document the storefront and safety boundary**

Update `README.md` with:

- New public routes
- `npm run test:storefront` verification command
- Current state: catalog and career funnel preview only
- Explicit note that resume intake, QuickBooks checkout, protected PDF delivery, and human-service purchase are not active in Phase 1
- Phase 2 interface: `[data-career-intake-pending]` is replaced by the secure intake route
- Existing Home Inspection Guide source pipeline remains unchanged

- [ ] **Step 5: Run the full local verification ladder**

Run:

```bash
npm run test:storefront
npm audit --omit=dev
python3 /Users/briankennedyjrm.ed/.codex/skills/secure-ai-operator/scripts/secure_repo_check.py .
git diff --check
```

Expected:

- All Node and Playwright tests PASS.
- `npm audit --omit=dev` reports zero production vulnerabilities.
- Secure repo check reports no committed secrets; investigate every warning rather than suppressing it.
- `git diff --check` exits 0.

- [ ] **Step 6: Perform visual QA without deploying**

Open the locally served pages at desktop and 390px mobile widths. Capture screenshots of:

- `products.html`
- `career-blueprint.html`
- `custom-solutions.html`

Verify typography, connected playbook route, focus visibility, mobile nav, content hierarchy, and absence of active checkout or public protected-file links. Fix only storefront defects discovered in this review.

- [ ] **Step 7: Commit verification and documentation**

```bash
git add tests/storefront-browser.spec.mjs playwright.config.mjs README.md
git commit -m "test: verify digital products storefront"
```

- [ ] **Step 8: Stop at the release gate**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
```

Report exact commits, tests, security results, screenshots, and unrelated pre-existing changes. Do not push or deploy until Brian approves the reviewed branch and the correct Ballers Kingdom hosting path is re-verified.

---

## Follow-on Plans

After this plan passes review, create and execute these separate plans in order:

1. `2026-08-29-career-intake-snapshot.md` — Firebase identity, private resume upload, save/resume intake, consent, free Snapshot generation, deletion workflow, and rules tests.
2. `2026-08-29-quickbooks-blueprint-commerce.md` — current official Intuit research, sandbox OAuth, hosted checkout selection, server-side verification, idempotent entitlements, source-backed Blueprint generation, and protected PDF delivery.
3. `2026-08-29-career-human-service.md` — paid five-business-day human workflow, operator queue, status tracking, guarded drafts, and introduction disclaimers.

Each follow-on plan must be written from the verified interfaces produced by the preceding phase. Production QuickBooks credentials, payments, outbound messages, and deployment remain separately approval-gated.


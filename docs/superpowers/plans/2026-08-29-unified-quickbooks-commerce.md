# Unified QuickBooks Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one secure Ballers Kingdom purchase flow that fulfills paid digital products immediately and routes scheduled services through approved QuickBooks invoices, with PayPal available through QuickBooks where supported.

**Architecture:** Firebase Hosting presents a shared order summary while Firebase Functions owns server-authoritative pricing, order state, QuickBooks operations, payment verification, reconciliation, and protected fulfillment. QuickBooks Online remains the financial system of record; Firestore stores operational state and opaque provider references only.

**Tech Stack:** Node.js 22, Firebase Functions v2, Firestore, Firebase Authentication, App Check, Google Secret Manager, QuickBooks Online Accounting API, verified QuickBooks Payments capability, Microsoft Graph, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-unified-quickbooks-commerce-design.md`

## Global Constraints

- QuickBooks Online is authoritative for customers, products/services, invoices, payments, fees, deposits, refunds, and reconciliation.
- QuickBooks Payments is the primary processor; do not build a direct PayPal API integration or parallel PayPal ledger.
- PayPal and Venmo may be presented only through capabilities enabled by the connected QuickBooks merchant account.
- Browser code never receives Intuit credentials, provider tokens, raw card data, or bank credentials.
- Browser redirects, screenshots, query parameters, and client callbacks are not proof of payment.
- Prices, currency, fulfillment type, and product availability are determined server-side.
- OAuth credentials and refresh tokens remain in Google Secret Manager; do not print or export secret values.
- Administrative operations require Firebase Authentication, App Check, and `admin: true`.
- Every provider write and state transition is idempotent and auditable.
- The existing owner approval gate remains mandatory before a service invoice is finalized or sent.
- No merchant activation, test charge, outbound message, production deploy, or refund occurs without the applicable explicit approval.
- Use explicit Firebase identity and target flags: project `the-ballers-kingdom`, account `lilpelejr12@gmail.com`, Hosting target `public`, Functions codebase `ballkingdom-integrations`.

---

## Planned File Structure

- `functions/src/commerce/catalog.js` — immutable public SKU definitions and server-side price lookup.
- `functions/src/commerce/order-state.js` — pure order validation and state-transition rules.
- `functions/src/commerce/order-repository.js` — Firestore transactions, claims, receipts, and queries.
- `functions/src/commerce/payment-contract.js` — normalized provider request/result validators.
- `functions/src/providers/quickbooks-payments.js` — the verified Intuit payment capability adapter only.
- `functions/src/commerce/commerce-service.js` — checkout, verification, reconciliation, fulfillment orchestration.
- `functions/src/commerce/fulfillment.js` — protected digital-delivery grants and service handoff.
- `functions/src/commerce/public-errors.js` — safe error codes and redaction.
- `functions/src/index.js` — thin Firebase trigger/callable/request bindings.
- `functions/test/commerce/*.test.js` — focused Node tests by responsibility.
- `assets/js/commerce-client.js` — public order-summary and provider-handoff client.
- `checkout.html` — shared accessible checkout/order-status page.
- `tests/commerce-browser.spec.mjs` — desktop and mobile customer journeys.
- `docs/operations/quickbooks-commerce-runbook.md` — merchant evidence, sandbox, rollout, monitoring, reconciliation, and rollback.

---

### Task 1: Verify the Merchant and Intuit Capability Boundary

**Files:**
- Create: `docs/operations/quickbooks-commerce-capability-evidence.md`
- Create: `functions/src/providers/quickbooks-payments-capability.js`
- Test: `functions/test/commerce/quickbooks-payments-capability.test.js`

**Interfaces:**
- Consumes: the signed-in QuickBooks company, Intuit production app metadata, and current official Intuit Payments documentation.
- Produces: `assertPaymentsCapability(config): {mode: string, supportsImmediatePayment: boolean, supportsPayPal: boolean, supportsWebhooks: boolean}` and a source-linked evidence record with no secrets.

- [ ] **Step 1: Capture read-only merchant evidence**

Record the company name/realm suffix, Payments approval state, enabled customer methods, deposit account last four digits if displayed, production app capability status, applicable transaction-rate screen date, and official source URLs. Use `Confirmed`, `Not confirmed`, or `Blocked by sign-in`; do not infer missing fields and do not copy credentials, full bank details, tokens, or private customer data.

- [ ] **Step 2: Write the failing capability-contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPaymentsCapability} from '../../src/providers/quickbooks-payments-capability.js';

test('rejects accounting-only Intuit configuration', () => {
  assert.throws(() => assertPaymentsCapability({accounting:true,payments:false}), /Payments capability/);
});

test('normalizes a verified QuickBooks Payments capability', () => {
  assert.deepEqual(assertPaymentsCapability({
    accounting:true,payments:true,mode:'documented-intuit-flow',
    supportsImmediatePayment:true,supportsPayPal:true,supportsWebhooks:true,
  }), {
    mode:'documented-intuit-flow',supportsImmediatePayment:true,
    supportsPayPal:true,supportsWebhooks:true,
  });
});
```

- [ ] **Step 3: Run the test and verify failure**

Run: `npm --prefix functions test -- commerce/quickbooks-payments-capability.test.js`

Expected: FAIL because `quickbooks-payments-capability.js` does not exist.

- [ ] **Step 4: Implement strict capability validation**

```js
export function assertPaymentsCapability(config) {
  if (!config?.accounting || !config?.payments) {
    throw new Error('QuickBooks Payments capability is not verified');
  }
  for (const key of ['mode','supportsImmediatePayment','supportsPayPal','supportsWebhooks']) {
    if (config[key] == null) throw new Error(`Payments capability is missing ${key}`);
  }
  return Object.freeze({
    mode:String(config.mode),
    supportsImmediatePayment:config.supportsImmediatePayment === true,
    supportsPayPal:config.supportsPayPal === true,
    supportsWebhooks:config.supportsWebhooks === true,
  });
}
```

- [ ] **Step 5: Stop if immediate server-verifiable payment is unavailable**

Do not select or invent an endpoint. If the approved merchant/app combination cannot create and independently verify an immediate website payment using current documented Intuit capabilities, mark digital checkout `Blocked` in the evidence file and return to Brian with the supported alternatives. Service invoicing may proceed independently.

- [ ] **Step 6: Run focused tests and commit**

```bash
npm --prefix functions test -- commerce/quickbooks-payments-capability.test.js
git add docs/operations/quickbooks-commerce-capability-evidence.md functions/src/providers/quickbooks-payments-capability.js functions/test/commerce/quickbooks-payments-capability.test.js
git commit -m "docs: verify QuickBooks commerce capability"
```

Expected: tests pass; the evidence document contains authoritative links and no secret values.

---

### Task 2: Build the Server-Authoritative Commerce Catalog

**Files:**
- Create: `functions/src/commerce/catalog.js`
- Create: `functions/test/commerce/catalog.test.js`
- Modify: `assets/js/product-catalog.js`

**Interfaces:**
- Consumes: existing public product slugs and owner-approved prices/tax classifications.
- Produces: `getCommerceItem(sku)` and `listPublicCommerceItems()` returning frozen `{sku,name,amountCents,currency,orderType,fulfillmentType,active}` objects.

- [ ] **Step 1: Write failing tests for canonical SKUs and tamper resistance**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {getCommerceItem} from '../../src/commerce/catalog.js';

test('returns the server price for a known digital product', () => {
  const item = getCommerceItem('home-inspection-study-guide');
  assert.equal(item.currency, 'USD');
  assert.equal(Number.isInteger(item.amountCents), true);
  assert.equal(item.fulfillmentType, 'protected_download');
});

test('does not accept an amount supplied by a browser', () => {
  const item = getCommerceItem('home-inspection-study-guide', {amountCents:1});
  assert.notEqual(item.amountCents, 1);
});

test('rejects unknown or inactive products', () => {
  assert.throws(() => getCommerceItem('not-a-product'), /unavailable/);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm --prefix functions test -- commerce/catalog.test.js`

Expected: FAIL because the commerce catalog does not exist.

- [ ] **Step 3: Implement frozen catalog lookup**

Define each approved SKU once in `catalog.js`. Do not duplicate prices in browser JavaScript. Until Brian approves a positive price and tax classification for a SKU, set `active:false`; `getCommerceItem()` must throw `Commerce item is unavailable`.

```js
const ITEMS = Object.freeze({
  'home-inspection-study-guide': Object.freeze({
    sku:'home-inspection-study-guide',
    name:'Home Inspection Study Guide',
    amountCents:0,
    currency:'USD',
    orderType:'digital_product',
    fulfillmentType:'protected_download',
    active:false,
  }),
});

export function getCommerceItem(sku) {
  const item = ITEMS[String(sku || '')];
  if (!item?.active || !Number.isInteger(item.amountCents) || item.amountCents <= 0) {
    throw new Error('Commerce item is unavailable');
  }
  return item;
}
```

- [ ] **Step 4: Make the browser catalog reference SKUs, never prices**

Add `commerceSku` to eligible public catalog entries. Keep purchase buttons disabled for inactive products and remove no existing fail-closed copy until the matching server item is active.

- [ ] **Step 5: Run tests and commit**

```bash
npm --prefix functions test -- commerce/catalog.test.js
npm run test:storefront:unit
git add functions/src/commerce/catalog.js functions/test/commerce/catalog.test.js assets/js/product-catalog.js
git commit -m "feat: add server commerce catalog"
```

---

### Task 3: Define Order State and Provider Contracts

**Files:**
- Create: `functions/src/commerce/order-state.js`
- Create: `functions/src/commerce/payment-contract.js`
- Create: `functions/src/commerce/public-errors.js`
- Create: `functions/test/commerce/order-state.test.js`
- Create: `functions/test/commerce/payment-contract.test.js`

**Interfaces:**
- Produces: `newOrder({item,customer})`, `transitionOrder(order,event)`, `validatePaymentResult(result,expected)`, `publicCommerceError(error)`.
- Order statuses: `created`, `pending_payment`, `payment_verifying`, `pending_invoice_approval`, `invoice_processing`, `invoiced`, `paid`, `fulfilling`, `fulfilled`, `cancelled`, `refunded`, `manual_review`.

- [ ] **Step 1: Write failing state-machine tests**

```js
test('allows verified payment to advance exactly once', () => {
  const verifying = {status:'payment_verifying',amountCents:4900,currency:'USD'};
  assert.equal(transitionOrder(verifying,{type:'PAYMENT_VERIFIED'}).status, 'paid');
  assert.throws(() => transitionOrder({status:'paid'},{type:'PAYMENT_VERIFIED'}), /Invalid order transition/);
});

test('preserves paid state when fulfillment fails', () => {
  const result = transitionOrder({status:'fulfilling'},{type:'FULFILLMENT_FAILED',code:'delivery_failed'});
  assert.equal(result.status, 'paid');
  assert.equal(result.lastErrorCode, 'delivery_failed');
});
```

- [ ] **Step 2: Write failing payment-validation tests**

```js
test('rejects a payment from the wrong realm or for the wrong amount', () => {
  assert.throws(() => validatePaymentResult(
    {realmId:'wrong',amountCents:1,currency:'USD',status:'completed'},
    {realmId:'right',amountCents:4900,currency:'USD'}
  ), /Payment verification mismatch/);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm --prefix functions test -- commerce/order-state.test.js commerce/payment-contract.test.js`

- [ ] **Step 4: Implement explicit transitions and normalized validation**

Use an allowlist keyed by current status and event. Reject all unspecified transitions. `validatePaymentResult()` must compare exact realm, integer cents, uppercase currency, provider order reference, and completed status; return an opaque normalized receipt only.

- [ ] **Step 5: Implement safe public errors**

Map internal failures to `invalid-order`, `payment-pending`, `payment-mismatch`, `fulfillment-delayed`, or `service-unavailable`. Never return `error.stack`, provider bodies, tokens, customer content, or raw exception messages.

- [ ] **Step 6: Run and commit**

```bash
npm --prefix functions test -- commerce/order-state.test.js commerce/payment-contract.test.js
git add functions/src/commerce/order-state.js functions/src/commerce/payment-contract.js functions/src/commerce/public-errors.js functions/test/commerce/order-state.test.js functions/test/commerce/payment-contract.test.js
git commit -m "feat: define secure commerce state"
```

---

### Task 4: Add Transactional Firestore Order Storage

**Files:**
- Create: `functions/src/commerce/order-repository.js`
- Create: `functions/test/commerce/order-repository.test.js`
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`
- Test: `functions/test/commerce/firestore-rules.test.js`

**Interfaces:**
- Consumes: normalized orders and transition results from Task 3.
- Produces: `createOrder()`, `getOrder()`, `claimTransition()`, `completeTransition()`, `recordFailure()`, `listReconciliationCandidates()`.

- [ ] **Step 1: Write failing repository tests**

Cover stable idempotency keys, duplicate transition claims, server timestamps, audit receipt creation, no token/provider-payload storage, and reconciliation queries for nonterminal orders.

```js
test('only one worker can claim payment verification', async () => {
  const results = await Promise.all([
    repository.claimTransition('order-1','payment_verifying','worker-a'),
    repository.claimTransition('order-1','payment_verifying','worker-b'),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/order-repository.test.js`

- [ ] **Step 3: Implement Firestore transactions**

Store `orders/{orderId}` and append-only `commerceAudit/{receiptId}`. Permit only normalized provider identifiers in `providerRefs`; reject keys matching `/token|card|bank|accountNumber|payload/i` before writes.

- [ ] **Step 4: Lock public Firestore access**

Add rules denying all direct client reads and writes to `orders`, `commerceAudit`, and fulfillment-grant records. All commerce access goes through App Check-enforced Functions.

- [ ] **Step 5: Add and run emulator rule tests**

Assert signed-out, ordinary signed-in, and admin clients cannot directly create, alter, or enumerate commerce records.

Run: `firebase emulators:exec --only firestore "npm --prefix functions test -- commerce/firestore-rules.test.js" --project the-ballers-kingdom`

- [ ] **Step 6: Commit**

```bash
git add functions/src/commerce/order-repository.js functions/test/commerce/order-repository.test.js functions/test/commerce/firestore-rules.test.js firestore.rules firestore.indexes.json
git commit -m "feat: secure commerce order storage"
```

---

### Task 5: Implement the Verified QuickBooks Payment Adapter

**Files:**
- Create: `functions/src/providers/quickbooks-payments.js`
- Create: `functions/test/commerce/quickbooks-payments.test.js`
- Modify: `functions/src/providers/oauth.js`
- Modify: `functions/src/index.js`
- Modify: `functions/README.md`

**Interfaces:**
- Consumes: the exact supported capability and official endpoints recorded by Task 1.
- Produces: `createQuickBooksPaymentsClient(config, fetchImpl)` with `createPaymentSession(order)`, `verifyPayment(reference)`, and `refundPayment({reference,amountCents,idempotencyKey})`.

- [ ] **Step 1: Pin the verified provider contract in tests**

Use mocked `fetchImpl` responses shaped exactly like the official Intuit documentation captured in Task 1. Assert the documented production host, OAuth scope, version, required headers, idempotency field, realm binding, integer-cent conversion, and response normalization. Do not proceed from memory or reuse the Accounting API scope as proof of Payments authorization.

- [ ] **Step 2: Write failure-path tests**

Cover expired access tokens, rotated refresh tokens, non-2xx redaction, wrong realm, wrong currency, partial/failed status, duplicate idempotency response, malformed provider data, and refund exceeding the verified paid amount.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/quickbooks-payments.test.js`

- [ ] **Step 4: Implement the narrow adapter**

The adapter returns only normalized records:

```js
{
  provider:'quickbooks',
  reference:String(providerReference),
  orderId:String(orderId),
  realmId:String(realmId),
  amountCents:Number(amountCents),
  currency:String(currency),
  status:'pending' | 'completed' | 'failed' | 'refunded',
  customerActionUrl:validatedHttpsUrlOrNull,
}
```

Validate any customer URL against the exact Intuit-owned hosts documented in Task 1. Persist rotated refresh tokens only through Secret Manager version creation; never log them.

- [ ] **Step 5: Bind only required secrets and permissions**

Add new secret bindings only if the verified Payments capability requires values not already represented. Grant secret-version access to the named Functions runtime identity, never project-wide administrator access.

- [ ] **Step 6: Run tests, dependency audit, and commit**

```bash
npm --prefix functions test -- commerce/quickbooks-payments.test.js
npm --prefix functions audit --omit=dev
git add functions/src/providers/quickbooks-payments.js functions/test/commerce/quickbooks-payments.test.js functions/src/providers/oauth.js functions/src/index.js functions/README.md
git commit -m "feat: add verified QuickBooks payment adapter"
```

---

### Task 6: Orchestrate Checkout, Verification, and Reconciliation

**Files:**
- Create: `functions/src/commerce/commerce-service.js`
- Create: `functions/test/commerce/commerce-service.test.js`
- Modify: `functions/src/index.js`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: catalog, repository, state machine, payment adapter, existing QuickBooks Accounting adapter.
- Produces: `startCheckout({sku,customer,idempotencyKey})`, `verifyOrderPayment({orderId})`, `reconcilePendingOrders(now)`, and App Check-enforced Firebase endpoints.

- [ ] **Step 1: Write failing orchestration tests**

Test server pricing, normalized customer data, duplicate checkout suppression, no fulfillment on redirect, independent verification, QuickBooks accounting reference persistence, wrong-payment manual review, and retry recovery.

```js
test('ignores a browser supplied amount and uses catalog price', async () => {
  const result = await service.startCheckout({
    sku:'home-inspection-study-guide',customer:{name:'A',email:'a@example.com'},
    amountCents:1,idempotencyKey:'checkout-1',
  });
  assert.equal(result.amountCents, catalogPrice);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/commerce-service.test.js`

- [ ] **Step 3: Implement checkout and verification orchestration**

`startCheckout()` creates the Firestore order first, calls the provider with `bk-order-${orderId}`, then stores only the opaque reference and validated customer action URL. `verifyOrderPayment()` fetches provider truth, validates it against the stored order, transactionally claims `paid`, and invokes accounting reconciliation once.

- [ ] **Step 4: Implement scheduled reconciliation**

Add `reconcileCommerceOrders` on an explicit schedule. Query only nonterminal orders older than the retry delay, cap each run, use exponential retry metadata, and move persistent mismatches to `manual_review`.

- [ ] **Step 5: Add callable/request security tests**

Assert App Check rejection, schema/length validation, rate limiting or bounded abuse controls, safe public errors, and admin enforcement for manual reconciliation/refund operations.

- [ ] **Step 6: Run and commit**

```bash
npm --prefix functions test -- commerce/commerce-service.test.js
npm --prefix functions run check
git add functions/src/commerce/commerce-service.js functions/test/commerce/commerce-service.test.js functions/src/index.js firebase.json
git commit -m "feat: orchestrate verified commerce payments"
```

---

### Task 7: Add Protected Digital Fulfillment

**Files:**
- Create: `functions/src/commerce/fulfillment.js`
- Create: `functions/test/commerce/fulfillment.test.js`
- Modify: `functions/src/commerce/commerce-service.js`
- Modify: `storage.rules`
- Test: `functions/test/commerce/storage-rules.test.js`

**Interfaces:**
- Consumes: a transactionally claimed `paid` order.
- Produces: `fulfillPaidOrder(order)`, `createDownloadGrant({orderId,customerUid})`, and a short-lived order-bound download response.

- [ ] **Step 1: Write failing fulfillment tests**

Cover unpaid denial, wrong user denial, expired grant denial, one paid order producing one grant, retry after delivery failure without a second charge, and path traversal rejection.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/fulfillment.test.js`

- [ ] **Step 3: Implement private-object delivery**

Keep paid artifacts outside the public Hosting directory. Resolve artifact keys from a server allowlist keyed by SKU. Create short-lived grants bound to `orderId`, authenticated customer UID, SKU, and expiry; never accept a storage path from the browser.

- [ ] **Step 4: Deny direct Storage enumeration and reads**

Storage Rules must deny public artifact reads. Delivery occurs through the validated Function or a narrowly scoped signed URL generated after grant validation.

- [ ] **Step 5: Run emulator tests and commit**

```bash
firebase emulators:exec --only firestore,storage,functions "npm --prefix functions test -- commerce/fulfillment.test.js commerce/storage-rules.test.js" --project the-ballers-kingdom
git add functions/src/commerce/fulfillment.js functions/test/commerce/fulfillment.test.js functions/test/commerce/storage-rules.test.js functions/src/commerce/commerce-service.js storage.rules
git commit -m "feat: protect paid digital fulfillment"
```

---

### Task 8: Connect Service Orders to Approved QuickBooks Invoices

**Files:**
- Modify: `functions/src/orchestration.js`
- Modify: `functions/src/providers/quickbooks.js`
- Modify: `functions/src/commerce/commerce-service.js`
- Test: `functions/test/commerce/service-invoicing.test.js`
- Modify: `functions/README.md`

**Interfaces:**
- Consumes: accepted appointments/approved quotes and the existing `approveInvoice` admin gate.
- Produces: a service order linked to one QuickBooks invoice and reconciled payment state.

- [ ] **Step 1: Write failing service-flow tests**

Assert that accepted bookings create operational orders, no invoice is finalized/sent before admin approval, approval creates one idempotent invoice, enabled QuickBooks payment methods remain provider-controlled, and a provider-paid invoice reconciles the order without a second charge.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/service-invoicing.test.js`

- [ ] **Step 3: Reuse order state without weakening approval**

Create service orders in `pending_invoice_approval` while retaining the existing appointment approval fields. The `approveInvoice` callable is the only path through `invoice_processing` to `invoiced`; independently verified provider payment advances `invoiced` to `paid`.

- [ ] **Step 4: Normalize invoice receipts**

Persist QuickBooks customer ID, invoice ID, document number, and order reference as opaque fields. Do not store invoice PDFs or full provider objects in Firestore.

- [ ] **Step 5: Verify Microsoft mail boundary**

Preserve `info@ballkingdom.com` as the operational sender. No test may call live Graph; use injected mocks and assert duplicate suppression.

- [ ] **Step 6: Run and commit**

```bash
npm --prefix functions test -- commerce/service-invoicing.test.js orchestration.test.js providers.test.js
git add functions/src/orchestration.js functions/src/providers/quickbooks.js functions/src/commerce/commerce-service.js functions/test/commerce/service-invoicing.test.js functions/README.md
git commit -m "feat: unify service invoicing with commerce"
```

---

### Task 9: Build the Shared Website Checkout and Status Experience

**Files:**
- Create: `checkout.html`
- Create: `assets/js/commerce-client.js`
- Modify: `products.html`
- Modify: `career-blueprint.html`
- Modify: `assets/js/products-page.js`
- Modify: `assets/css/styles.css`
- Modify: `firebase.json`
- Create: `tests/commerce-browser.spec.mjs`
- Modify: `playwright.config.mjs`

**Interfaces:**
- Consumes: public checkout/status endpoints from Task 6.
- Produces: accessible `Buy`, order summary, provider handoff, verification-pending, paid, fulfillment-delayed, fulfilled, cancelled, and manual-support views.

- [ ] **Step 1: Write failing browser tests**

```js
test('digital product uses server order summary before provider handoff', async ({page}) => {
  await page.goto('/products.html');
  await page.getByRole('link',{name:/Get the Home Inspection Guide/i}).click();
  await expect(page).toHaveURL(/checkout/);
  await expect(page.getByRole('heading',{name:/Review your order/i})).toBeVisible();
  await expect(page.getByText(/payment is verified/i)).toBeVisible();
});

test('payment redirect alone does not unlock fulfillment', async ({page}) => {
  await page.goto('/checkout.html?order=unverified&payment=success');
  await expect(page.getByText(/verification in progress/i)).toBeVisible();
  await expect(page.getByRole('link',{name:/download/i})).toHaveCount(0);
});
```

- [ ] **Step 2: Run browser tests and verify failure**

Run: `npx playwright test tests/commerce-browser.spec.mjs`

- [ ] **Step 3: Implement the shared order summary**

Render item name, server-returned price, currency, customer fields, fulfillment terms, refund/cancellation links, and one provider handoff action. Never render or collect raw card/bank fields.

- [ ] **Step 4: Implement status polling with bounded retries**

Poll the server order-status endpoint using a non-secret order handle. Stop on terminal state or timeout. Render `Payment verification in progress` for provider-success/unverified orders and `We have your payment; delivery is delayed` for paid fulfillment failures.

- [ ] **Step 5: Preserve fail-closed product buttons**

Enable each purchase button only when the server exposes the matching active SKU. If Functions or App Check is unavailable, show `Checkout is temporarily unavailable` and do not fall back to mailto, an unverified payment link, or a public file.

- [ ] **Step 6: Run accessibility, mobile, and Hosting-boundary tests**

Confirm keyboard flow, visible focus, labels, error announcements, 390px mobile layout, and that Functions/tests/private artifacts remain excluded from Hosting.

- [ ] **Step 7: Commit**

```bash
npm run test:storefront
npx playwright test tests/commerce-browser.spec.mjs
git add checkout.html assets/js/commerce-client.js products.html career-blueprint.html assets/js/products-page.js assets/css/styles.css firebase.json tests/commerce-browser.spec.mjs playwright.config.mjs
git commit -m "feat: add unified commerce checkout experience"
```

---

### Task 10: Add Refund, Reconciliation, and Operator Controls

**Files:**
- Modify: `functions/src/commerce/commerce-service.js`
- Create: `functions/test/commerce/refunds.test.js`
- Modify: `functions/src/index.js`
- Create: `docs/operations/quickbooks-commerce-runbook.md`

**Interfaces:**
- Produces: `requestRefund({orderId,amountCents,reason,adminUid})`, `reconcileOrder({orderId,adminUid})`, and redacted admin results.

- [ ] **Step 1: Write failing refund tests**

Test unauthenticated rejection, non-admin rejection, App Check rejection, excessive/duplicate refund rejection, provider failure preserving paid state, completed refund reconciliation, and audit receipt creation.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/refunds.test.js`

- [ ] **Step 3: Implement admin-only controls**

Require `admin:true`, a nonempty bounded reason, integer cents not exceeding the verified unrefunded amount, stable idempotency, and provider confirmation before `refunded` state.

- [ ] **Step 4: Write the operations runbook**

Include identities, scoped commands, sandbox setup, secret names without values, monitoring queries, manual-review handling, settlement/deposit verification, refund procedure, outage behavior, rollback, and explicit approval points.

- [ ] **Step 5: Run and commit**

```bash
npm --prefix functions test -- commerce/refunds.test.js
git add functions/src/commerce/commerce-service.js functions/test/commerce/refunds.test.js functions/src/index.js docs/operations/quickbooks-commerce-runbook.md
git commit -m "feat: add commerce reconciliation controls"
```

---

### Task 11: Complete Local, Sandbox, and Security Verification

**Files:**
- Modify only files for defects proven by this verification.
- Create: `docs/operations/quickbooks-commerce-verification.md`

**Interfaces:**
- Consumes: Tasks 1–10.
- Produces: a source-grounded release recommendation and exact unresolved blockers.

- [ ] **Step 1: Run the complete local suite**

```bash
npm ci
npm --prefix functions ci
npm run test:storefront
npm --prefix functions test
npm --prefix functions run check
firebase emulators:exec --only auth,firestore,storage,functions "npm --prefix functions test" --project the-ballers-kingdom
```

- [ ] **Step 2: Run dependency and secret checks**

```bash
npm audit --omit=dev
npm --prefix functions audit --omit=dev
python3 /Users/briankennedyjrm.ed/.codex/skills/secure-ai-operator/scripts/secure_repo_check.py .
git diff --check
```

Classify synthetic test fixtures separately from real findings. Do not waive a production secret or high-severity runtime vulnerability.

- [ ] **Step 3: Verify sandbox journeys**

Complete digital purchase success, abandonment, delayed verification, duplicate callback, wrong amount, fulfillment retry, service invoice approval, and refund in sandbox. Verify each against the provider sandbox, Firestore emulator/test environment, accounting record, and audit receipt.

- [ ] **Step 4: Review Firebase packaging**

Run the repository release guard/dry run with explicit `--project the-ballers-kingdom --account lilpelejr12@gmail.com`. Confirm Hosting maps `public -> ballkingdom-com`, Functions maps only `ballkingdom-integrations`, and no private artifact, test fixture, backend source, or secret file enters the Hosting manifest.

- [ ] **Step 5: Write verification evidence and commit**

```bash
git add docs/operations/quickbooks-commerce-verification.md
git commit -m "docs: verify QuickBooks commerce release"
```

The evidence must distinguish local, emulator, sandbox, and production truth and list every remaining production gate.

---

### Task 12: Release One Owner-Controlled Pilot

**Files:**
- Modify: `docs/operations/quickbooks-commerce-verification.md`
- Modify only configuration required by the approved pilot SKU.

**Interfaces:**
- Consumes: approved verification evidence and explicit production authorization.
- Produces: one monitored, reversible production pilot with independent QuickBooks and Firebase proof.

- [ ] **Step 1: Obtain explicit approvals**

Require Brian's approval for the exact SKU and price/tax configuration, production merchant activation if still pending, secret/IAM changes, scoped Functions deployment, scoped Hosting deployment, one low-value live charge, any customer email, and any refund. One approval does not imply another.

- [ ] **Step 2: Verify identity, target, commit, and rollback**

Read back Firebase account/project/targets, QuickBooks company/realm, Git commit, clean source packaging, existing live versions, and rollback commands before mutation.

- [ ] **Step 3: Deploy Functions only after approval**

Use the repository release guard and explicit scoped command for `functions:ballkingdom-integrations`. Smoke-test unauthenticated/App Check denial before enabling any product.

- [ ] **Step 4: Enable one pilot SKU and deploy Hosting only after approval**

Activate only the approved SKU, rerun the entire relevant test set, and deploy only `hosting:public` to `ballkingdom-com`.

- [ ] **Step 5: Run one approved low-value owner transaction**

Verify customer checkout, provider payment state, QuickBooks sale/invoice/payment, processing fee, settlement/deposit status, Firebase order/audit state, and protected fulfillment from independent sources. Do not treat the website success screen as confirmation.

- [ ] **Step 6: Execute an approved refund if requested**

Verify the refund independently in QuickBooks Payments, QuickBooks accounting, Firebase audit state, and the original payment method. Do not refund automatically merely because the test charge succeeded.

- [ ] **Step 7: Record the measured result**

Update the verification document with non-secret timestamps, identifiers truncated to safe suffixes, observed behavior, rollback status, and remaining rollout gates. Commit the evidence without private customer or payment data.

---

## Completion Criteria

- QuickBooks merchant and developer capabilities are independently verified from authoritative sources.
- Digital products cannot fulfill until provider payment is independently verified.
- Services retain Brian's invoice approval gate and reconcile paid invoices into the same order system.
- PayPal is available only through QuickBooks-supported customer methods; no standalone PayPal pipeline exists.
- QuickBooks remains the authoritative accounting record.
- All direct commerce collections and paid artifacts are denied to public clients.
- App Check, admin authorization, idempotency, replay protection, redaction, reconciliation, and refund limits pass automated tests.
- Local, emulator, sandbox, dependency, secret, Hosting-boundary, and browser verification pass.
- Production remains fail-closed until each scoped deployment and live transaction receives explicit approval.

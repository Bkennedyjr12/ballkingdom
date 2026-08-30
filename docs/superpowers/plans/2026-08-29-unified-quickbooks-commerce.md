# Unified QuickBooks Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one secure Ballers Kingdom payable-invoice flow that sends digital invoices automatically only after pilot approval, keeps service invoices administrator-gated, and fulfills solely from independently verified QuickBooks Accounting evidence.

**Architecture:** Firebase Hosting presents a shared order summary and normalized invoice/payment status while Firebase Functions owns server-authoritative pricing, order state, durable invoice-create/send effects, Accounting entity normalization, payment verification, reconciliation, and protected fulfillment. The existing QuickBooks Accounting adapter remains the only provider boundary; QuickBooks webhooks are signed hints that trigger authoritative re-fetch, and scheduled reconciliation is mandatory recovery.

**Tech Stack:** Node.js 22, Firebase Functions v2, Firestore, Firebase Authentication, App Check, Google Secret Manager, QuickBooks Online Accounting API, Microsoft Graph for non-invoice operational messages, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-unified-quickbooks-commerce-design.md`

## Global Constraints

- QuickBooks Online is authoritative for customers, products/services, invoices, payments, fees, deposits, refunds, and reconciliation.
- QuickBooks Payments is active and presents Cards and PayPal/Venmo through QuickBooks invoices; do not build a direct PayPal/Venmo API integration or parallel ledger.
- The website never creates a Payments API session, embeds a payment form, or exposes an inferred QuickBooks invoice pay URL.
- Browser code never receives Intuit credentials, provider tokens, raw card data, or bank credentials.
- Browser state, invoice creation/send responses, email, customer assertions, webhook payloads, and invoice balance alone are not proof of payment.
- Prices, currency, fulfillment type, and product availability are determined server-side.
- OAuth credentials and refresh tokens remain in Google Secret Manager; do not print or export secret values.
- Administrative operations require Firebase Authentication, App Check, and `admin: true`.
- Every provider write, durable effect, and state transition is idempotent and auditable; ambiguous invoice-send outcomes are never retried blindly.
- The existing owner approval gate remains mandatory before a service invoice is finalized or sent.
- Automatic digital invoice send is code-only until a separately approved production pilot.
- No account change, webhook configuration, invoice, customer email, payment, production deploy, or refund occurs without the applicable explicit approval.
- The production Accounting app is not visible to the signed-in Intuit Developer identity; app ownership/configuration and production webhooks remain release blockers.
- The repository still lacks the authoritative production Firestore Rules source and working Java rules-unit-testing; the local deny fragment must not be wired for deployment.
- Use explicit Firebase identity and target flags: project `the-ballers-kingdom`, account `lilpelejr12@gmail.com`, Hosting target `public`, Functions codebase `ballkingdom-integrations`.

---

## Revision Boundary

Tasks 1–4 below are completed historical plan records and remain unchanged. Their original Payments-capability discovery text does not authorize or define Tasks 5–12. The remaining implementation uses the approved Accounting Invoice path documented in the [Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice), [Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment), and [webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) documentation.

---

## Planned File Structure

- `functions/src/commerce/catalog.js` — immutable public SKU definitions and server-side price lookup.
- `functions/src/commerce/order-state.js` — pure order validation and state-transition rules.
- `functions/src/commerce/order-repository.js` — Firestore transactions, claims, receipts, and queries.
- `functions/src/commerce/payment-contract.js` — existing normalized completed-payment validator.
- `functions/src/providers/quickbooks.js` — existing Accounting adapter, extended for documented invoice send, Invoice/Payment reads, and change data capture.
- `functions/src/commerce/quickbooks-payment-verifier.js` — provider-payload-neutral exact Invoice/Payment evidence policy.
- `functions/src/providers/quickbooks-webhooks.js` — raw-body Intuit signature verification and normalized webhook hints.
- `functions/src/commerce/commerce-service.js` — digital invoice, payment verification, reconciliation, and fulfillment orchestration.
- `functions/src/commerce/fulfillment.js` — protected digital-delivery grants and service handoff.
- `functions/src/commerce/public-errors.js` — safe error codes and redaction.
- `functions/src/index.js` — thin Firebase trigger/callable/request bindings.
- `functions/test/commerce/*.test.js` — focused Node tests by responsibility.
- `assets/js/commerce-client.js` — public order-summary and normalized status client.
- `order-status.html` — shared accessible invoice-sent/payment-verification page.
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

### Task 5: Extend the Accounting Adapter and Add Invoice-Payment Verification

**Files:**
- Modify: `functions/src/providers/quickbooks.js`
- Create: `functions/src/commerce/quickbooks-payment-verifier.js`
- Create: `functions/test/commerce/quickbooks-invoices.test.js`
- Create: `functions/test/commerce/quickbooks-payment-verifier.test.js`
- Modify: `functions/README.md`

**Interfaces:**
- Consumes: the existing `createQuickBooksClient(config, fetchImpl)`, Task 3's `validatePaymentResult(result, expected)`, and current official Accounting [Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice) and [Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment) contracts.
- Produces: `createQuickBooksClient()` methods `createCommerceInvoice(order)`, `sendInvoice({invoiceId,customerEmail})`, `getInvoice(invoiceId)`, `getPayment(paymentId)`, and `getAccountingChanges({changedSince})`; plus `verifyQuickBooksPaymentEvidence(evidence, expected): {providerPaymentRef:string}`.

- [ ] **Step 1: Pin the current Accounting operations before implementation**

Record the exact method, path, query parameters, request headers, and response envelope for Invoice create/read/send, Payment read, and change data capture from the current official Intuit documentation in the focused tests. The current official [Intuit Developer Accounting collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/overview) may be used to cross-check the current Accounting operations. If the send operation cannot be confirmed unambiguously, stop this task with digital invoice send blocked; do not infer a path, response field, pay URL, or delivery receipt.

- [ ] **Step 2: Write failing adapter contract tests**

Use an injected `fetchImpl` and official response shapes. Assert the existing Accounting production/sandbox host selection and OAuth scope, deterministic `requestid` for `createCommerceInvoice()`, the exact stable `bk-order-${orderId}` reference, one Invoice send operation, integer-cent normalization, rotated refresh-token persistence callback, and redacted non-2xx errors. Assert that `sendInvoice()` returns only `{invoiceId,sendAccepted:true}` and never a payment state or customer URL.

```js
test('an invoice send response is not normalized as payment proof', async () => {
  const receipt = await client.sendInvoice({invoiceId:'30',customerEmail:'ada@example.com'});
  assert.deepEqual(receipt, {invoiceId:'30',sendAccepted:true});
  assert.equal(Object.hasOwn(receipt, 'status'), false);
  assert.equal(Object.hasOwn(receipt, 'url'), false);
});
```

- [ ] **Step 3: Write failing exact-evidence tests**

```js
test('verifies one exact active payment applied to the expected invoice', () => {
  const evidence = {
    realmId:'realm-7', invoiceId:'invoice-30', providerOrderRef:'bk-order-order-1',
    invoiceAmountCents:4900, invoiceBalanceCents:0, currency:'USD',
    payments:[{
      providerPaymentRef:'payment-42', linkedInvoiceId:'invoice-30',
      appliedAmountCents:4900, active:true,
    }],
  };
  assert.deepEqual(verifyQuickBooksPaymentEvidence(evidence, {
    realmId:'realm-7', invoiceId:'invoice-30', providerOrderRef:'bk-order-order-1',
    amountCents:4900, currency:'USD',
  }), {providerPaymentRef:'payment-42'});
});
```

Add explicit rejection cases for the wrong realm, invoice ID, order reference, invoice amount, currency, nonzero balance, no linked Payment, partial amount, split payments, overpayment, inactive/deleted Payment, malformed evidence, and raw provider payload keys.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/quickbooks-invoices.test.js commerce/quickbooks-payment-verifier.test.js`

Expected: FAIL because the new client methods and verifier do not exist.

- [ ] **Step 5: Extend the existing Accounting adapter narrowly**

Keep access-token refresh, customers, items, existing service invoice behavior, and PDF reads in `quickbooks.js`. Add commerce Invoice create/read/send, Payment read, and documented change-data-capture methods without adding a Payments API host or OAuth scope. `createCommerceInvoice()` must embed the immutable order reference, use a deterministic request ID, and return only opaque customer/invoice IDs and document number. `sendInvoice()` must call only the documented Accounting Invoice send operation and normalize acceptance without claiming inbox delivery or payment.

Normalize provider entities inside the adapter to this internal shape:

```js
{
  realmId:String(realmId),
  invoiceId:String(invoiceId),
  providerOrderRef:String(providerOrderRef),
  invoiceAmountCents:Number(invoiceAmountCents),
  invoiceBalanceCents:Number(invoiceBalanceCents),
  currency:String(currency),
  payments:[{
    providerPaymentRef:String(paymentId),
    linkedInvoiceId:String(linkedInvoiceId),
    appliedAmountCents:Number(appliedAmountCents),
    active:Boolean(active),
  }],
}
```

This shape is not an asserted Intuit response schema. Map it only from fields confirmed in the current Invoice and Payment documentation, reject unknown/malformed structures, and never return the raw object. Persist rotated refresh tokens only through the existing Secret Manager version callback; never log them.

- [ ] **Step 6: Implement the provider-payload-neutral verifier**

`verifyQuickBooksPaymentEvidence()` must require exactly one active Payment linked to the expected Invoice for the exact full amount, exact realm/order reference/currency, exact invoice total, and zero invoice balance. It must construct the existing Task 3 input and delegate the final completed-state check to `validatePaymentResult()`:

```js
return validatePaymentResult({
  realmId:evidence.realmId,
  amountCents:payment.appliedAmountCents,
  currency:evidence.currency,
  providerOrderRef:evidence.providerOrderRef,
  providerPaymentRef:payment.providerPaymentRef,
  status:'completed',
}, expected);
```

No browser value, send response, webhook payload, customer assertion, or invoice balance by itself may create this normalized completed result.

- [ ] **Step 7: Run tests, dependency audit, and commit**

```bash
npm --prefix functions test -- commerce/quickbooks-invoices.test.js commerce/quickbooks-payment-verifier.test.js providers.test.js oauth.test.js
npm --prefix functions audit --omit=dev
git add functions/src/providers/quickbooks.js functions/src/commerce/quickbooks-payment-verifier.js functions/test/commerce/quickbooks-invoices.test.js functions/test/commerce/quickbooks-payment-verifier.test.js functions/README.md
git commit -m "feat: verify QuickBooks invoice payments"
```

---

### Task 6: Orchestrate Digital Invoices, Webhook Hints, and Reconciliation

**Files:**
- Create: `functions/src/commerce/commerce-service.js`
- Create: `functions/src/providers/quickbooks-webhooks.js`
- Create: `functions/test/commerce/commerce-service.test.js`
- Create: `functions/test/commerce/quickbooks-webhooks.test.js`
- Modify: `functions/src/commerce/order-repository.js`
- Modify: `functions/test/commerce/order-repository.test.js`
- Modify: `functions/src/index.js`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: catalog, existing order state/repository, extended QuickBooks Accounting adapter, `verifyQuickBooksPaymentEvidence()`, and Intuit's current [webhooks contract](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks).
- Produces: `createDigitalOrder({sku,customer,idempotencyKey})`, `getOrderStatus({orderHandle})`, `verifyOrderPayment({orderId,source})`, `acceptQuickBooksWebhook({rawBody,signature})`, `reconcilePendingOrders(now)`, and App Check-enforced public/admin Firebase endpoints.

- [ ] **Step 1: Add failing durable-effect repository tests**

Add `claimEffect(orderId,effect,workerId)`, `completeEffect(orderId,effect,workerId,claimId,result)`, and `recordEffectFailure(...)` for `invoice_create` and `invoice_send`. Assert one concurrent claimant, immutable Invoice references, duplicate completion suppression, bounded safe error codes, and no provider payload storage. A failed create may retry with its deterministic request ID. An ambiguous send failure must set `status:'manual_review'` with `lastErrorCode:'invoice_send_unknown'` and must not reopen the send claim for blind retry.

- [ ] **Step 2: Write failing digital-order orchestration tests**

```js
test('creates and sends one server-priced invoice without returning a pay URL', async () => {
  const result = await service.createDigitalOrder({
    sku:'home-inspection-study-guide',customer:{name:'A',email:'a@example.com'},
    amountCents:1,idempotencyKey:'order-1',
  });
  assert.equal(result.amountCents, catalogPrice);
  assert.equal(result.status, 'payment_verification_pending');
  assert.equal(Object.hasOwn(result, 'url'), false);
  assert.equal(quickbooks.createCommerceInvoiceCalls.length, 1);
  assert.equal(quickbooks.sendInvoiceCalls.length, 1);
});
```

Cover duplicate submission, a recovered existing invoice after create timeout, confirmed send acceptance, send failure, ambiguous send outcome, no fulfillment from create/send responses, exact evidence success, mismatched evidence to `manual_review`, and retry recovery without another invoice or email. Assert service orders are rejected by `createDigitalOrder()` and cannot bypass `approveInvoice`.

- [ ] **Step 3: Write failing webhook tests**

Test the exact raw request bytes with valid and invalid `intuit-signature` fixtures derived from the current official documentation. Assert verification happens before JSON parsing, wrong-realm notifications are rejected, duplicate Invoice/Payment events are idempotent, raw bodies/signatures are never persisted, and accepted events store only `{realmId,entityName,entityId,operation,lastUpdated}` as a reconciliation hint. A valid event must not change an order status until the Accounting adapter is re-read.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/order-repository.test.js commerce/commerce-service.test.js commerce/quickbooks-webhooks.test.js`

Expected: FAIL because durable effects, commerce service, and webhook verification do not exist.

- [ ] **Step 5: Implement digital invoice creation and send**

`createDigitalOrder()` must load the server catalog item, ignore any browser amount, create the Task 3 order, claim `invoice_create`, call `createCommerceInvoice()` with `bk-order-${orderId}`, and persist `realmId`, `invoiceId`, `customerId`, and `providerOrderRef`. It then separately claims `invoice_send` and calls `sendInvoice()` with the stored Invoice ID and normalized customer email. Return only:

```js
{
  orderHandle:String(nonSecretHandle),
  amountCents:Number(serverAmountCents),
  currency:String(serverCurrency),
  status:'payment_verification_pending',
  message:'QuickBooks sent payment instructions to your email.',
}
```

The production call path remains disabled until Task 12 approvals. A known pre-send failure may retry safely; an ambiguous post-request failure must stop in manual review rather than risk a second email.

- [ ] **Step 6: Implement authoritative payment verification**

`verifyOrderPayment()` must load the stored order and Invoice ID, re-fetch the Invoice and every Payment candidate through the Accounting adapter, normalize them, run `verifyQuickBooksPaymentEvidence()`, transactionally claim `payment_verifying -> paid`, and invoke fulfillment once. Send responses, website status, webhook hints, and customer input are ignored as proof. Exact mismatches transition to `manual_review`; not-yet-paid evidence returns safely to `pending_payment` with a later reconciliation time.

- [ ] **Step 7: Implement signed webhook hints**

Verify Intuit's signature against the unchanged raw body using the app verifier token and constant-time comparison exactly as documented. Parse only after verification; allowlist Invoice and Payment changes; require the configured realm; store a replay-safe hash plus normalized identifiers; return promptly. Bind the verifier-token secret and configure the production webhook only after the owning developer app becomes visible and the specific change is approved. Until then, keep the endpoint code/tested but undeployed or disabled.

- [ ] **Step 8: Implement mandatory scheduled reconciliation**

Add `reconcileCommerceOrders` on an explicit schedule. Query only due nonterminal orders, cap each run, use bounded exponential retry metadata, call the documented Accounting change-data-capture operation for Invoice/Payment discovery within its supported look-back window, then re-fetch exact entities before verification. Reconcile stored Invoice IDs directly even when no webhook or CDC match exists. This schedule remains enabled as recovery if webhooks are unavailable, disabled, delayed, duplicated, or missed. Intuit's current [official Accounting CDC collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4) defines the capability boundary.

- [ ] **Step 9: Add callable/request security tests**

Assert App Check rejection for public order/status callables, schema/length validation, a non-secret opaque order handle, bounded polling, abuse controls, safe public errors, and administrator enforcement for manual reconciliation/refund operations. The webhook endpoint uses signature/realm verification instead of App Check and never returns entity or order details.

- [ ] **Step 10: Run and commit**

```bash
npm --prefix functions test -- commerce/order-repository.test.js commerce/commerce-service.test.js commerce/quickbooks-webhooks.test.js
npm --prefix functions run check
git add functions/src/commerce/commerce-service.js functions/src/providers/quickbooks-webhooks.js functions/test/commerce/commerce-service.test.js functions/test/commerce/quickbooks-webhooks.test.js functions/src/commerce/order-repository.js functions/test/commerce/order-repository.test.js functions/src/index.js firebase.json
git commit -m "feat: orchestrate QuickBooks invoice payments"
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
- Consumes: a transactionally claimed `paid` order produced only by Task 6's exact Accounting Invoice/Payment verifier.
- Produces: `fulfillPaidOrder(order)`, `createDownloadGrant({orderId,customerUid})`, and a short-lived order-bound download response.

- [ ] **Step 1: Write failing fulfillment tests**

Cover unpaid denial, invoice-created denial, invoice-send-accepted denial, webhook-hint denial, wrong user denial, expired grant denial, one verified paid order producing one grant, retry after delivery failure without another invoice/payment, and path traversal rejection.

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

### Task 8: Route Approved Service Orders Through QuickBooks Invoice Send

**Files:**
- Modify: `functions/src/orchestration.js`
- Modify: `functions/src/providers/quickbooks.js`
- Modify: `functions/src/commerce/commerce-service.js`
- Test: `functions/test/commerce/service-invoicing.test.js`
- Modify: `functions/README.md`

**Interfaces:**
- Consumes: accepted appointments/approved quotes and the existing `approveInvoice` admin gate.
- Produces: a service order linked to one QuickBooks-sent invoice and the same authoritative Accounting payment state as digital orders.

- [ ] **Step 1: Write failing service-flow tests**

Assert that accepted bookings create operational orders, no invoice is created or sent before administrator approval, approval creates or recovers one idempotent invoice, QuickBooks sends it once, Microsoft Graph does not send a duplicate invoice/PDF, enabled payment methods remain QuickBooks-controlled, and exact Accounting evidence reconciles the order without another invoice or payment.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/service-invoicing.test.js`

- [ ] **Step 3: Reuse order state without weakening approval**

Create service orders in `pending_invoice_approval` while retaining the existing appointment approval fields. The App Check-enforced `approveInvoice` callable remains the only path through `invoice_processing` to `invoiced`. It claims invoice creation and send as separate effects, reuses the stored invoice on retry, and treats an ambiguous send outcome as manual review rather than resending. Task 6's independently re-fetched Accounting evidence is the only path from `invoiced` through `payment_verifying` to `paid`.

- [ ] **Step 4: Normalize invoice receipts**

Persist QuickBooks customer ID, invoice ID, document number, order reference, and normalized send-effect receipt as opaque fields. Do not store invoice PDFs, provider URLs, raw Invoice/Payment objects, or send response bodies in Firestore.

- [ ] **Step 5: Preserve the Microsoft operational-mail boundary**

Remove the Graph-delivered invoice PDF from `approveInvoice`; use the documented QuickBooks Accounting invoice-send operation after approval. Preserve `info@ballkingdom.com` for accepted-booking confirmations and other operational messages only. No test may call live Graph or QuickBooks; use injected mocks and assert invoice-email duplicate suppression across both providers.

- [ ] **Step 6: Run and commit**

```bash
npm --prefix functions test -- commerce/service-invoicing.test.js orchestration.test.js providers.test.js
git add functions/src/orchestration.js functions/src/providers/quickbooks.js functions/src/commerce/commerce-service.js functions/test/commerce/service-invoicing.test.js functions/README.md
git commit -m "feat: send approved service invoices with QuickBooks"
```

---

### Task 9: Build the Shared Invoice-Sent and Payment-Verification Experience

**Files:**
- Create: `order-status.html`
- Create: `assets/js/commerce-client.js`
- Modify: `products.html`
- Modify: `career-blueprint.html`
- Modify: `assets/js/products-page.js`
- Modify: `assets/css/styles.css`
- Modify: `firebase.json`
- Create: `tests/commerce-browser.spec.mjs`
- Modify: `playwright.config.mjs`

**Interfaces:**
- Consumes: `createDigitalOrder()` and `getOrderStatus()` endpoints from Task 6.
- Produces: accessible `Buy`, order summary, invoice-send-pending, payment-verification-pending, paid, fulfillment-delayed, fulfilled, cancelled, and manual-support views with no provider URL.

- [ ] **Step 1: Write failing browser tests**

```js
test('digital product shows QuickBooks email instructions without a pay URL', async ({page}) => {
  await page.goto('/products.html');
  await page.getByRole('link',{name:/Get the Home Inspection Guide/i}).click();
  await expect(page).toHaveURL(/order-status/);
  await expect(page.getByRole('heading',{name:/Review your order/i})).toBeVisible();
  await page.getByRole('button',{name:/Send payment instructions/i}).click();
  await expect(page.getByText(/QuickBooks sent payment instructions to your email/i)).toBeVisible();
  await expect(page.locator('a[href*="quickbooks"], a[href*="intuit"]')).toHaveCount(0);
});

test('client assertions do not unlock fulfillment', async ({page}) => {
  await page.goto('/order-status.html?order=unverified&payment=success');
  await expect(page.getByText(/payment verification is pending/i)).toBeVisible();
  await expect(page.getByRole('link',{name:/download/i})).toHaveCount(0);
});
```

- [ ] **Step 2: Run browser tests and verify failure**

Run: `npx playwright test tests/commerce-browser.spec.mjs`

- [ ] **Step 3: Implement the shared purchase and order summary**

Render item name, server-returned price, currency, customer name/email fields, fulfillment terms, refund/cancellation links, and `Send payment instructions`. Explain before submission that QuickBooks will email the payable invoice and that Ballers Kingdom will verify payment before delivery. Never render or collect card, bank, PayPal, or Venmo credentials.

- [ ] **Step 4: Implement status polling with bounded retries**

Poll only the normalized Firebase order-status endpoint using a non-secret order handle. Stop on terminal state or timeout. Render `QuickBooks sent payment instructions to your email. Payment verification is pending.` after confirmed send acceptance and `We have verified your payment; delivery is delayed` for paid fulfillment failures. Ignore query parameters, browser callbacks, and customer assertions as state authority.

The public response allowlist is:

```js
{
  orderHandle:String(orderHandle),
  status:'invoice_send_pending' | 'payment_verification_pending' | 'paid' |
    'fulfillment_delayed' | 'fulfilled' | 'cancelled' | 'manual_support',
  message:String(publicMessage),
  downloadUrl:status === 'fulfilled' ? String(shortLivedOrderBoundUrl) : null,
}
```

Reject any unexpected `url`, `providerUrl`, raw Invoice/Payment field, or accounting identifier before rendering.

- [ ] **Step 5: Preserve fail-closed product buttons**

Enable each purchase button only when the server exposes the matching active SKU. If Functions or App Check is unavailable, show `Purchasing is temporarily unavailable` and do not fall back to mailto, an unverified payment link, or a public file.

- [ ] **Step 6: Run accessibility, mobile, and Hosting-boundary tests**

Confirm keyboard flow, visible focus, labels, error announcements, 390px mobile layout, and that Functions/tests/private artifacts remain excluded from Hosting.

- [ ] **Step 7: Commit**

```bash
npm run test:storefront
npx playwright test tests/commerce-browser.spec.mjs
git add order-status.html assets/js/commerce-client.js products.html career-blueprint.html assets/js/products-page.js assets/css/styles.css firebase.json tests/commerce-browser.spec.mjs playwright.config.mjs
git commit -m "feat: add QuickBooks invoice status experience"
```

---

### Task 10: Add Refund Review, Reconciliation, and Operator Controls

**Files:**
- Modify: `functions/src/commerce/commerce-service.js`
- Create: `functions/test/commerce/refunds.test.js`
- Modify: `functions/src/index.js`
- Create: `docs/operations/quickbooks-commerce-runbook.md`

**Interfaces:**
- Produces: `requestRefundReview({orderId,amountCents,reason,adminUid})`, `reconcileOrder({orderId,adminUid})`, `reconcileRefund({orderId,adminUid})`, and redacted admin results. No method initiates a provider refund in the first release.

- [ ] **Step 1: Write failing refund tests**

Test unauthenticated rejection, non-admin rejection, App Check rejection, excessive/duplicate review rejection, paid/fulfilled state preservation before authoritative refund evidence, exact Accounting refund/reversal reconciliation when the current documented entity evidence is sufficient, insufficient-evidence manual review, and redacted audit receipt creation.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- commerce/refunds.test.js`

- [ ] **Step 3: Implement admin-only review and reconciliation controls**

Require `admin:true`, App Check, a nonempty bounded reason, integer cents not exceeding the verified unrefunded amount, and stable idempotency. `requestRefundReview()` records an approved internal work item only; it does not call a QuickBooks Payments API or alter QuickBooks. `reconcileRefund()` may transition to `refunded` only after the Accounting adapter re-fetches current documented entities and normalizes exact invoice/payment/refund or reversal evidence for the same realm/order/amount. If the current Accounting documentation does not expose sufficient proof for that processor refund, preserve `paid`/`fulfilled` and require manual accounting review rather than inventing a completed field.

- [ ] **Step 4: Write the operations runbook**

Include identities, scoped commands, sandbox setup, secret names without values, webhook-disabled reconciliation, monitoring queries, invoice-send ambiguity handling, manual-review handling, settlement/deposit verification, the separately approved QuickBooks operator refund procedure, authoritative read-back, outage behavior, rollback, and explicit approval points. State that a refund request is not approval to execute it and an external QuickBooks action is not reconciled until independently verified.

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

The final emulator command is a required release gate, but it is currently blocked: this repository has only an unconfigured commerce-deny fragment rather than the authoritative production Firestore Rules source, and Java/rules-unit-testing is unavailable. Do not represent the static fragment test as runtime authorization proof. Recover and merge the authoritative rules source, install/verify Java, then run the full signed-out/ordinary/admin rules suite before any Firestore Rules release.

- [ ] **Step 2: Run dependency and secret checks**

```bash
npm audit --omit=dev
npm --prefix functions audit --omit=dev
python3 /Users/briankennedyjrm.ed/.codex/skills/secure-ai-operator/scripts/secure_repo_check.py .
git diff --check
```

Classify synthetic test fixtures separately from real findings. Do not waive a production secret or high-severity runtime vulnerability.

- [ ] **Step 3: Verify Accounting invoice and payment journeys without live outbound effects**

Use injected mocks for the documented Invoice send operation and assert its exact current method/path/headers/response envelope without sending an email. In an Intuit sandbox, create/read only sandbox customers, items, invoices, and Payments when supported and authorized for the test account; do not send an invoice to a real address. Cover unpaid invoice, exact paid invoice, delayed verification, partial/split/wrong-amount/wrong-realm/wrong-reference evidence, fulfillment retry, service approval, and refund-insufficient-evidence behavior. Verify each against the sandbox Accounting entity, Firestore emulator/test environment, and audit receipt. No live company, production email, payment, or refund is authorized.

- [ ] **Step 4: Verify webhook hints and mandatory recovery**

Run published-shape local webhook fixtures for valid signature, invalid signature, changed raw bytes, wrong realm, replay, Invoice hint, and Payment hint. Prove that an accepted webhook does not transition payment until mocked authoritative entity re-fetch passes. Disable the webhook path and prove scheduled reconciliation reaches the same result; then simulate delayed, duplicated, and missed events. Production webhook configuration remains blocked until the owning Intuit Developer app is visible and access/configuration is separately approved.

- [ ] **Step 5: Review Firebase packaging**

Run the repository release guard/dry run with explicit `--project the-ballers-kingdom --account lilpelejr12@gmail.com`. Confirm Hosting maps `public -> ballkingdom-com`, Functions maps only `ballkingdom-integrations`, and no private artifact, test fixture, backend source, or secret file enters the Hosting manifest.

- [ ] **Step 6: Write verification evidence and commit**

```bash
git add docs/operations/quickbooks-commerce-verification.md
git commit -m "docs: verify QuickBooks commerce release"
```

The evidence must distinguish mocked, local, emulator, Intuit sandbox, signed-in read-only, and production truth. It must list the missing authoritative Firestore Rules/Java emulator proof and invisible developer app/webhook ownership as unresolved production blockers.

---

### Task 12: Release One Owner-Controlled Pilot

**Files:**
- Modify: `docs/operations/quickbooks-commerce-verification.md`
- Modify only configuration required by the approved pilot SKU.

**Interfaces:**
- Consumes: approved verification evidence and explicit production authorization.
- Produces: one monitored, reversible production pilot with independent QuickBooks and Firebase proof.

- [ ] **Step 1: Obtain explicit approvals**

Require Brian's separate approval for the exact SKU and price/tax/item mapping, production app/webhook configuration if proposed, secret/IAM changes, authoritative Firestore Rules release, scoped Functions deployment, scoped Hosting deployment, one QuickBooks invoice send, the exact customer email recipient, one low-value owner payment, and any refund. One approval does not imply another. Automatic digital invoice send remains disabled until these pilot approvals are recorded.

- [ ] **Step 2: Verify identity, target, commit, and rollback**

Read back Firebase account/project/targets, QuickBooks company/realm, the visible owning Intuit app if webhooks are part of the pilot, Git commit, authoritative Rules source/hash, Java emulator evidence, clean source packaging, existing live versions, and rollback commands before mutation. If the production app is still invisible or Rules proof is incomplete, do not deploy the pilot.

- [ ] **Step 3: Deploy Functions only after approval**

Use the repository release guard and explicit scoped command for `functions:ballkingdom-integrations`. Deploy no webhook verifier-token binding or endpoint configuration unless the owning app is visible and the exact configuration is approved. Smoke-test unauthenticated/App Check denial before enabling any product.

- [ ] **Step 4: Enable one pilot SKU and deploy Hosting only after approval**

Activate only the approved SKU, rerun the entire relevant test set, and deploy only `hosting:public` to `ballkingdom-com`.

- [ ] **Step 5: Send one approved QuickBooks invoice and customer email**

Submit the approved digital order once and verify one server-priced QuickBooks Invoice, one stored invoice ID/order reference, one documented QuickBooks invoice-send response, and one customer email at the exact approved address. The response and email prove neither delivery nor payment. If the send outcome is ambiguous, stop in manual review and do not resend blindly.

- [ ] **Step 6: Run one approved low-value owner payment**

Pay through the method QuickBooks presents in its invoice email. Verify the exact realm, Invoice, order reference, total, currency, zero balance, one active linked Payment for the full amount, Firebase state/audit, and protected fulfillment from independent sources. Also inspect QuickBooks Payments and the settlement/deposit view. Do not treat the website, email, webhook, Invoice send response, or Invoice balance alone as confirmation.

- [ ] **Step 7: Execute an approved refund if requested**

Perform the refund in QuickBooks only after its separate approval. Verify it independently in QuickBooks Payments, QuickBooks accounting, Firebase audit state, and the original payment method. If Accounting entities cannot prove the refund under the documented contract, retain manual review and do not manufacture `refunded`. Do not refund automatically merely because the owner payment succeeded.

- [ ] **Step 8: Record the measured result**

Update the verification document with non-secret timestamps, identifiers truncated to safe suffixes, observed behavior, rollback status, and remaining rollout gates. Commit the evidence without private customer or payment data.

---

## Completion Criteria

- The existing Accounting adapter creates one deterministic invoice, invokes only the documented Invoice send operation, and returns no provider pay URL.
- Digital products cannot fulfill until exact realm, Invoice, order reference, amount, currency, zero balance, and one active full linked Payment are independently re-fetched and verified.
- Services retain Brian's invoice creation/send approval gate and reconcile paid invoices through the same verifier.
- PayPal/Venmo remain QuickBooks-presented methods; no standalone wallet pipeline exists.
- QuickBooks remains the authoritative accounting record.
- All direct commerce collections and paid artifacts are denied to public clients.
- Valid webhooks create hints only; invalid signatures/realms are rejected; every transition uses authoritative re-fetch.
- Scheduled reconciliation recovers correctly with webhooks unavailable, delayed, duplicated, or missed.
- App Check, admin authorization, invoice/effect idempotency, replay protection, redaction, reconciliation, and refund-review limits pass automated tests.
- The authoritative production Firestore Rules source is recovered/merged and the Java rules-unit-testing emulator suite passes; the current fragment/static check is insufficient.
- The owning Intuit Developer app is visible and approved before any production webhook configuration; otherwise scheduled reconciliation is the only enabled recovery path.
- Mocked, local, emulator, Accounting sandbox, dependency, secret, Hosting-boundary, and browser verification pass without an unapproved invoice/email/payment/refund.
- Production remains fail-closed until each scoped deployment, one QuickBooks invoice send/customer email, owner payment, and optional refund receives its own explicit approval and independent verification.

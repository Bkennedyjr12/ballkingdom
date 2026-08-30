# Unified QuickBooks Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one secure Ballers Kingdom payable-invoice flow that sends email-link-authenticated digital invoices automatically only after pilot approval, leaves the current administrator-gated service path unchanged until a separately approved migration, and fulfills solely from independently verified QuickBooks Accounting evidence.

**Architecture:** Firebase Hosting presents a shared order summary and normalized invoice/payment status while Firebase Functions owns server-authoritative pricing, order state, durable invoice-create/send effects, Accounting entity normalization, payment verification, reconciliation, and protected fulfillment. The existing QuickBooks Accounting adapter remains the only provider boundary; QuickBooks webhooks are signed hints that trigger authoritative re-fetch, and scheduled reconciliation is mandatory recovery.

**Tech Stack:** Node.js 22, Firebase Functions v2, Firestore, Firebase Authentication, App Check, Google Secret Manager, QuickBooks Online Accounting API, Microsoft Graph for the unchanged current service invoice path and operational messages until separate service migration, Node test runner, Playwright.

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
- The production Accounting app is not visible to the signed-in Intuit Developer identity; this blocks production webhook configuration, but not a scheduled-reconciliation-only pilot when the existing Accounting OAuth connection and every other gate are verified.
- The repository still lacks the authoritative production Firestore Rules source and working Java rules-unit-testing; the local deny fragment must not be wired for deployment.
- The repository has no `storage.rules` or configured authoritative Storage Rules source; missing authoritative production Storage policy/bucket mapping and emulator proof blocks the pilot.
- `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED` and `COMMERCE_SERVICE_QBO_SEND_ENABLED` are independent and default false; the first pilot may enable only the digital flag.
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
- `functions/src/commerce/feature-flags.js` — independent default-off digital-pilot and service-migration gates.
- `functions/src/commerce/fulfillment.js` — protected digital-delivery grants and service handoff.
- `functions/src/commerce/public-errors.js` — safe error codes and redaction.
- `functions/src/index.js` — thin Firebase trigger/callable/request bindings.
- `functions/test/commerce/*.test.js` — focused Node tests by responsibility.
- `assets/js/commerce-client.js` — public order-summary and normalized status client.
- `order-status.html` — shared accessible invoice-sent/payment-verification page.
- `tests/commerce-browser.spec.mjs` — desktop and mobile customer journeys.
- `storage.rules` — authoritative production Storage policy after source recovery/merge; direct paid-artifact access remains denied.
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
test('verifies one exact present payment fully applied only to the expected invoice', () => {
  const evidence = {
    realmId:'realm-7',
    invoice:{
      invoiceId:'invoice-30', providerOrderRef:'bk-order-order-1',
      totalAmountCents:4900, balanceCents:0, currency:'USD',
      entityState:'present', paymentState:'paid',
    },
    payments:[{
      providerPaymentRef:'payment-42', entityState:'present',
      totalAmountCents:4900, unappliedAmountCents:0,
      applications:[{linkedTxnId:'invoice-30',linkedTxnType:'Invoice',amountCents:4900}],
    }],
  };
  assert.deepEqual(verifyQuickBooksPaymentEvidence(evidence, {
    realmId:'realm-7', invoiceId:'invoice-30', providerOrderRef:'bk-order-order-1',
    amountCents:4900, currency:'USD',
  }), {providerPaymentRef:'payment-42'});
});
```

Add explicit rejection cases for the wrong realm, invoice ID, order reference, Invoice `TotalAmt`, currency, nonzero `Balance`, missing/unknown/deleted/voided/reversed/partially-paid Invoice state, no linked Payment, Payment `TotalAmt` mismatch, nonzero `UnappliedAmt`, partial/over application, split payments, multiple applications or multiple Invoice IDs, non-`Invoice` `LinkedTxn.TxnType`, missing/unknown/deleted/voided Payment state, malformed evidence, and raw provider payload keys. Assert that no fixture supplies an invented `active` Boolean or a provider `completed` value.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `npm --prefix functions test -- test/commerce/quickbooks-invoices.test.js test/commerce/quickbooks-payment-verifier.test.js`

Expected: FAIL because the new client methods and verifier do not exist.

- [ ] **Step 5: Extend the existing Accounting adapter narrowly**

Keep access-token refresh, customers, items, existing service invoice behavior, and PDF reads in `quickbooks.js`. Add commerce Invoice create/read/send, Payment read, and documented change-data-capture methods without adding a Payments API host or OAuth scope. `createCommerceInvoice()` must embed the immutable order reference, use a deterministic request ID, and return only opaque customer/invoice IDs and document number. `sendInvoice()` must call only the documented Accounting Invoice send operation and normalize acceptance without claiming inbox delivery or payment.

Normalize provider entities inside the adapter to this internal shape:

```js
{
  realmId:String(realmId),
  invoice:{
    invoiceId:String(invoiceId),
    providerOrderRef:String(providerOrderRef),
    totalAmountCents:Number(totalAmountCents),
    balanceCents:Number(balanceCents),
    currency:String(currency),
    entityState:'present' | 'deleted' | 'voided' | 'unknown',
    paymentState:'paid' | 'partially_paid' | 'unpaid' | 'voided' | 'reversed' | 'unknown',
  },
  payments:[{
    providerPaymentRef:String(paymentId),
    entityState:'present' | 'deleted' | 'voided' | 'unknown',
    totalAmountCents:Number(totalAmountCents),
    unappliedAmountCents:Number(unappliedAmountCents),
    applications:[{
      linkedTxnId:String(linkedTxnId),
      linkedTxnType:String(linkedTxnType),
      amountCents:Number(amountCents),
    }],
  }],
}
```

This shape is not an asserted Intuit response schema. Pin its mapping in adapter tests to the current official [Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice), [Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment), and [Intuit-maintained Accounting collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/overview): Invoice `TotalAmt`, `Balance`, currency, and documented status/deletion/void/payment-state evidence; Payment `TotalAmt`, `UnappliedAmt`, documented status/deletion/void evidence; and line `Amount` plus `LinkedTxn.TxnId`/`TxnType`. The adapter normalizes a successful exact entity with no documented deletion/void marker to `present`; any documented deleted/voided marker, unknown/missing required state, 404, or contradictory response fails closed. Do not invent an `active` Boolean. Reject unknown/malformed structures and never return the raw object. Persist rotated refresh tokens only through the existing Secret Manager version callback; never log them.

- [ ] **Step 6: Implement the provider-payload-neutral verifier**

`verifyQuickBooksPaymentEvidence()` must require exact realm/order reference/currency, a present and paid Invoice with exact `TotalAmt` and zero `Balance`, and exactly one present Payment whose `TotalAmt` is the exact expected amount, `UnappliedAmt` is zero, and sole application has the exact amount, expected Invoice ID, and `TxnType:'Invoice'`. Reject partial, split, multi-invoice, unapplied, over-, under-, deleted, voided, reversed, or unknown evidence. Only after those checks may it construct the existing Task 3 input and delegate the final application-state check to `validatePaymentResult()`:

```js
return validatePaymentResult({
  realmId:evidence.realmId,
  amountCents:payment.totalAmountCents,
  currency:evidence.invoice.currency,
  providerOrderRef:evidence.invoice.providerOrderRef,
  providerPaymentRef:payment.providerPaymentRef,
  status:'completed',
}, expected);
```

`status:'completed'` is an internal conclusion at this final line, not a field copied from Intuit or assigned before evidence verification. No browser value, send response, webhook payload, customer assertion, Payment total alone, or Invoice balance alone may create it.

- [ ] **Step 7: Run tests, dependency audit, and commit**

```bash
npm --prefix functions test -- test/commerce/quickbooks-invoices.test.js test/commerce/quickbooks-payment-verifier.test.js test/providers.test.js test/oauth.test.js
npm --prefix functions audit --omit=dev
git add functions/src/providers/quickbooks.js functions/src/commerce/quickbooks-payment-verifier.js functions/test/commerce/quickbooks-invoices.test.js functions/test/commerce/quickbooks-payment-verifier.test.js functions/README.md
git commit -m "feat: verify QuickBooks invoice payments"
```

---

### Task 6: Orchestrate Digital Invoices, Webhook Hints, and Reconciliation

**Files:**
- Create: `functions/src/commerce/commerce-service.js`
- Create: `functions/src/commerce/feature-flags.js`
- Create: `functions/src/providers/quickbooks-webhooks.js`
- Create: `functions/test/commerce/commerce-service.test.js`
- Create: `functions/test/commerce/feature-flags.test.js`
- Create: `functions/test/commerce/quickbooks-webhooks.test.js`
- Modify: `functions/src/commerce/order-repository.js`
- Modify: `functions/test/commerce/order-repository.test.js`
- Modify: `functions/src/index.js`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: catalog, existing order state/repository, extended QuickBooks Accounting adapter, `verifyQuickBooksPaymentEvidence()`, and Intuit's current [webhooks contract](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks).
- Produces: `createDigitalOrder({sku,customerName,idempotencyKey}, authContext)`, `getOrderStatus({orderHandle}, authContext)`, `verifyOrderPayment({orderId,source})`, `acceptQuickBooksWebhook({rawBody,signature})`, `reconcilePendingOrders(now)`, two independent default-off feature flags, and Firebase Auth plus App Check-enforced customer/admin endpoints.

- [ ] **Step 1: Add failing durable-effect repository tests**

Add `claimEffect(orderId,effect,workerId,now)`, `completeEffect(orderId,effect,workerId,claimId,result)`, `recordEffectFailure(...)`, and `recoverExpiredEffects(now)` for `invoice_create` and `invoice_send`. Each claim has a unique claim ID, `claimedAt`, and five-minute `leaseExpiresAt`. Assert one concurrent claimant, immutable Invoice references, exact-claim completion, duplicate completion suppression, bounded safe error codes, and no provider payload storage. A stale create lease may recover the Invoice by deterministic request ID/order reference before retry. A stale send lease is ambiguous: scheduled recovery must set `status:'manual_review'` with `lastErrorCode:'invoice_send_unknown'`, permanently close that send claim, and never call `sendInvoice()` again.

- [ ] **Step 2: Write failing digital-order orchestration tests**

```js
test('creates and sends one server-priced invoice without returning a pay URL', async () => {
  const result = await service.createDigitalOrder({
    sku:'home-inspection-study-guide',customerName:'A',
    amountCents:1,idempotencyKey:'order-1',
  }, {uid:'customer-uid',email:'a@example.com',emailVerified:true});
  assert.equal(result.amountCents, catalogPrice);
  assert.equal(result.status, 'payment_verification_pending');
  assert.equal(Object.hasOwn(result, 'url'), false);
  assert.equal(quickbooks.createCommerceInvoiceCalls.length, 1);
  assert.equal(quickbooks.sendInvoiceCalls.length, 1);
});
```

Cover both flags defaulting false; digital order denial while its flag is false; duplicate submission; a recovered existing invoice after create timeout; confirmed send acceptance; send failure; five-minute lease expiry; stale ambiguous send to `manual_review` with no second send; no fulfillment from create/send responses; exact evidence success; mismatched evidence to `manual_review`; and recovery without another invoice or email. Assert service orders are rejected by `createDigitalOrder()` and cannot bypass `approveInvoice`. Keep `COMMERCE_SERVICE_QBO_SEND_ENABLED` false throughout these tests.

- [ ] **Step 3: Write failing webhook tests**

Test the exact raw request bytes with valid and invalid `intuit-signature` fixtures derived from the current official documentation. Assert verification happens before JSON parsing, wrong-realm notifications are rejected, duplicate Invoice/Payment events are idempotent, raw bodies/signatures are never persisted, and accepted events store only `{realmId,entityName,entityId,operation,lastUpdated}` as a reconciliation hint. A valid event must not change an order status until the Accounting adapter is re-read.

- [ ] **Step 4: Run focused tests and verify failure**

Run: `npm --prefix functions test -- test/commerce/order-repository.test.js test/commerce/commerce-service.test.js test/commerce/feature-flags.test.js test/commerce/quickbooks-webhooks.test.js`

Expected: FAIL because durable effects, commerce service, and webhook verification do not exist.

- [ ] **Step 5: Implement digital invoice creation and send**

Define `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=false` and `COMMERCE_SERVICE_QBO_SEND_ENABLED=false` as Firebase Functions Boolean parameters via `defineBoolean`, preserving the default when unset and rejecting non-Boolean test/config input. `createDigitalOrder()` first requires the digital flag, App Check, and a Firebase Auth token containing `uid`, `email`, and `email_verified:true`. It loads the server catalog item, ignores browser amount/UID/email fields, creates the Task 3 order with immutable `customerUid=request.auth.uid` and the normalized token email, and commits that order before `invoice_create` can be claimed. It calls `createCommerceInvoice()` with `bk-order-${orderId}` and persists `realmId`, `invoiceId`, `customerId`, and `providerOrderRef`. It then separately claims `invoice_send` and calls `sendInvoice()` with the stored Invoice ID and verified token email. Return only:

```js
{
  orderHandle:String(nonSecretHandle),
  amountCents:Number(serverAmountCents),
  currency:String(serverCurrency),
  status:'payment_verification_pending',
  message:'QuickBooks sent payment instructions to your email.',
}
```

The opaque `orderHandle` is routing data, not authorization. The production call path remains disabled until Task 12 approvals. A known pre-send failure may retry only within the still-owned live lease before dispatch. The scheduled worker handles expired claims: deterministic create recovery may retry after exact read-back, but an expired send claim is ambiguous and must stop in manual review rather than risk a second email.

- [ ] **Step 6: Implement authoritative payment verification**

`verifyOrderPayment()` must load the stored order and Invoice ID, re-fetch the Invoice and every Payment candidate through the Accounting adapter, normalize them, run `verifyQuickBooksPaymentEvidence()`, transactionally claim `payment_verifying -> paid`, and invoke fulfillment once. Send responses, website status, webhook hints, and customer input are ignored as proof. Exact mismatches transition to `manual_review`; not-yet-paid evidence returns safely to `pending_payment` with a later reconciliation time.

- [ ] **Step 7: Implement signed webhook hints**

Verify Intuit's signature against the unchanged raw body using the app verifier token and constant-time comparison exactly as documented. Parse only after verification; allowlist Invoice and Payment changes; require the configured realm; store a replay-safe hash plus normalized identifiers; return promptly. Bind the verifier-token secret and configure the production webhook only after the owning developer app becomes visible and the specific change is approved. Until then, keep the endpoint code/tested but undeployed or disabled.

- [ ] **Step 8: Implement mandatory scheduled reconciliation**

Add `reconcileCommerceOrders` on an explicit schedule. Query only due nonterminal orders, cap each run, use bounded exponential retry metadata, call the documented Accounting change-data-capture operation for Invoice/Payment discovery within its supported look-back window, then re-fetch exact entities before verification. Reconcile stored Invoice IDs directly even when no webhook or CDC match exists. This schedule remains enabled as recovery if webhooks are unavailable, disabled, delayed, duplicated, or missed. Intuit's current [official Accounting CDC collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4) defines the capability boundary.

The same schedule calls `recoverExpiredEffects(now)` first. A stale create effect performs exact order-reference/read-back recovery and resumes only if no Invoice exists. A stale invoice-send effect never dispatches: it closes the effect as ambiguous, transitions the order to `manual_review`, records `invoice_send_unknown`, and emits a redacted operator alert. Tests use an injected clock to prove the pre-expiry no-op, post-expiry create recovery, post-expiry send quarantine, and zero resend calls.

- [ ] **Step 9: Add callable/request security tests**

Assert signed-out rejection, unverified-email rejection, App Check rejection, a client-supplied UID/email being ignored, immutable `customerUid` creation before invoice effects, and `getOrderStatus()` requiring `request.auth.uid === order.customerUid`. Cover the correct UID, wrong UID, guessed/modified handle, deleted user/token rejection, Firebase-emulator email-link completion and reused-link denial, schema/length validation, bounded polling, abuse controls, safe public errors, and administrator enforcement for manual reconciliation/refund operations. Status responses contain no customer email or accounting identifiers. The webhook endpoint uses signature/realm verification instead of App Check and never returns entity or order details.

- [ ] **Step 10: Run and commit**

```bash
npm --prefix functions test -- test/commerce/order-repository.test.js test/commerce/commerce-service.test.js test/commerce/feature-flags.test.js test/commerce/quickbooks-webhooks.test.js
npm --prefix functions run check
git add functions/src/commerce/commerce-service.js functions/src/commerce/feature-flags.js functions/src/providers/quickbooks-webhooks.js functions/test/commerce/commerce-service.test.js functions/test/commerce/feature-flags.test.js functions/test/commerce/quickbooks-webhooks.test.js functions/src/commerce/order-repository.js functions/test/commerce/order-repository.test.js functions/src/index.js firebase.json
git commit -m "feat: orchestrate QuickBooks invoice payments"
```

---

### Task 7: Add Protected Digital Fulfillment

**Files:**
- Create: `functions/src/commerce/fulfillment.js`
- Create: `functions/test/commerce/fulfillment.test.js`
- Modify: `functions/src/commerce/commerce-service.js`
- Modify: `functions/src/index.js`
- Create: `storage.rules`
- Modify: `firebase.json` (add the verified Storage Rules source and add `storage.rules` to both Hosting ignore lists)
- Create: `functions/test/commerce/storage-rules.test.js`

**Interfaces:**
- Consumes: a transactionally claimed `paid` order produced only by Task 6's exact Accounting Invoice/Payment verifier.
- Produces: `fulfillPaidOrder(order)`, `createDownloadGrant({orderId}, authContext)`, `redeemDownloadGrant({orderId,grant}, authContext)`, and an authenticated one-use order-bound streaming response.

- [ ] **Step 1: Write failing fulfillment tests**

Cover signed-out/App Check denial; unpaid, invoice-created, invoice-send-accepted, and webhook-hint denial; correct owner and wrong UID; client-supplied UID ignored; a guessed handle; 256-bit nonce generation with digest-only persistence; ten-minute boundary; expired, modified, wrong-order, wrong-SKU, concurrent, and replayed grant denial; exactly one successful atomic redemption; retry after a consumed streaming failure by issuing a new authenticated grant without another invoice/payment; and path traversal rejection.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- test/commerce/fulfillment.test.js`

- [ ] **Step 3: Implement private-object delivery**

Keep paid artifacts outside the public Hosting directory. Resolve artifact keys from a server allowlist keyed by SKU. `createDownloadGrant()` derives the caller UID from Firebase Auth, requires App Check and `request.auth.uid === order.customerUid`, then creates a cryptographically random 256-bit nonce. Store only its SHA-256 digest, bound order ID/customer UID/SKU, `expiresAt=issuedAt+10 minutes`, and nullable `consumedAt`; never accept a UID or storage path from the browser. `redeemDownloadGrant()` requires the same Firebase UID and App Check, hashes the submitted nonce, and transactionally changes exactly one matching unexpired grant from unused to consumed before the Function streams the allowlisted object. Concurrent or replayed redemption fails. If streaming fails after consumption, the still-authenticated owner must request a new grant; the nonce is never reopened.

- [ ] **Step 4: Deny direct Storage enumeration and reads**

The repository currently has no `storage.rules`, no Storage block in `firebase.json`, and no verified production Storage Rules source or bucket mapping. Before writing deployable rules, recover and hash the authoritative production source and document the bucket mapping. Merge the narrow paid-artifact direct-read denial without replacing unrelated live policy. If that source cannot be recovered, stop with both the Storage Rules release and production pilot blocked; do not treat a new local deny file as production truth.

After recovery and review, create the merged `storage.rules`, configure `firebase.json` with `"storage":{"rules":"storage.rules"}`, and add `storage.rules` to both Hosting ignore lists so Hosting cannot serve it. Direct client enumeration, reads, and writes to paid artifacts are denied; only the Admin SDK inside the authenticated redemption Function may read the allowlisted object. Do not return a reusable public signed URL.

- [ ] **Step 5: Run emulator tests and commit**

```bash
firebase emulators:exec --only auth,firestore,storage,functions "npm --prefix functions test -- test/commerce/fulfillment.test.js test/commerce/storage-rules.test.js" --project the-ballers-kingdom
git add functions/src/commerce/fulfillment.js functions/test/commerce/fulfillment.test.js functions/test/commerce/storage-rules.test.js functions/src/commerce/commerce-service.js functions/src/index.js storage.rules firebase.json
git commit -m "feat: protect paid digital fulfillment"
```

---

### Task 8: Route Approved Service Orders Through QuickBooks Invoice Send

**Files:**
- Modify: `functions/src/orchestration.js`
- Modify: `functions/src/index.js`
- Modify: `functions/src/providers/quickbooks.js`
- Modify: `functions/src/commerce/commerce-service.js`
- Modify: `functions/src/commerce/order-repository.js`
- Modify: `functions/test/orchestration.test.js`
- Modify: `functions/test/commerce/order-repository.test.js`
- Create: `functions/test/commerce/service-invoicing.test.js`
- Modify: `functions/README.md`

**Interfaces:**
- Consumes: accepted appointments/approved quotes and the existing `approveInvoice` admin gate.
- Produces: a default-off, separately approved service migration path. While `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`, the existing service approval and Graph/PDF behavior remains unchanged; when true, an approved service order is linked to one QuickBooks-sent invoice and the same authoritative Accounting payment state as digital orders.

- [ ] **Step 1: Write failing service-flow tests**

Assert that both commerce flags default false and are independent. With the service flag false, accepted bookings and `approveInvoice` preserve the existing Graph/PDF path exactly and make no new commerce-order or QuickBooks-send effect. With only the service flag true in a separate test, accepted bookings create operational orders, no invoice is created or sent before administrator approval, approval creates or recovers one idempotent invoice, QuickBooks sends it once, Microsoft Graph does not send a duplicate invoice/PDF, enabled payment methods remain QuickBooks-controlled, and exact Accounting evidence reconciles the order without another invoice or payment. Prove the digital flag cannot enable service migration.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm --prefix functions test -- test/commerce/service-invoicing.test.js test/orchestration.test.js test/commerce/order-repository.test.js`

- [ ] **Step 3: Reuse order state without weakening approval**

Branch at the existing `approveInvoice` entry point on `COMMERCE_SERVICE_QBO_SEND_ENABLED`, not on the digital pilot flag. When false, execute the current tested service behavior without creating a commerce order or altering its effects. When true after separate approval, create service orders in `pending_invoice_approval` while retaining the existing appointment approval fields. The App Check-enforced `approveInvoice` callable remains the only path through `invoice_processing` to `invoiced`. It claims invoice creation and send as separate leased effects, reuses the stored invoice on retry, and treats an expired/ambiguous send claim as manual review rather than resending. Task 6's independently re-fetched Accounting evidence is the only path from `invoiced` through `payment_verifying` to `paid`.

- [ ] **Step 4: Normalize invoice receipts**

Persist QuickBooks customer ID, invoice ID, document number, order reference, and normalized send-effect receipt as opaque fields. Do not store invoice PDFs, provider URLs, raw Invoice/Payment objects, or send response bodies in Firestore.

- [ ] **Step 5: Preserve the Microsoft operational-mail boundary**

Preserve the Graph-delivered invoice PDF in the service-flag-false branch. In the separately enabled branch, suppress that PDF and use the documented QuickBooks Accounting invoice-send operation after approval; preserve `info@ballkingdom.com` for accepted-booking confirmations and other operational messages only. No test may call live Graph or QuickBooks; use injected mocks and assert invoice-email duplicate suppression across both providers and both flag states.

- [ ] **Step 6: Run and commit**

```bash
npm --prefix functions test -- test/commerce/service-invoicing.test.js test/orchestration.test.js test/commerce/order-repository.test.js test/providers.test.js
git add functions/src/orchestration.js functions/src/index.js functions/src/providers/quickbooks.js functions/src/commerce/commerce-service.js functions/src/commerce/order-repository.js functions/test/orchestration.test.js functions/test/commerce/order-repository.test.js functions/test/commerce/service-invoicing.test.js functions/README.md
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
- Consumes: Firebase email-link authentication, `createDigitalOrder()` and owner-authorized `getOrderStatus()` endpoints from Task 6, and owner-authorized single-use fulfillment grants from Task 7.
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

Render item name, server-returned price, currency, customer name/email fields, fulfillment terms, refund/cancellation links, and `Send payment instructions`. Complete Firebase email-link sign-in before calling `createDigitalOrder`; after authentication, treat the verified token email as authoritative and do not let the browser substitute another UID/email. Handle a consumed, expired, modified, or reused email link as signed out and require a fresh link. Explain before submission that QuickBooks will email the payable invoice and that Ballers Kingdom will verify payment before delivery. Never render or collect card, bank, PayPal, or Venmo credentials.

- [ ] **Step 4: Implement status polling with bounded retries**

Poll only the normalized Firebase order-status endpoint using the Firebase ID token, App Check token, and non-secret order handle. The Function must authorize the token UID against the immutable order `customerUid`; the handle never authorizes a read. Stop on terminal state or timeout. Render `QuickBooks sent payment instructions to your email. Payment verification is pending.` after confirmed send acceptance and `We have verified your payment; delivery is delayed` for paid fulfillment failures. Ignore query parameters, browser callbacks, and customer assertions as state authority.

The public response allowlist is:

```js
{
  orderHandle:String(orderHandle),
  status:'invoice_send_pending' | 'payment_verification_pending' | 'paid' |
    'fulfillment_delayed' | 'fulfilled' | 'cancelled' | 'manual_support',
  message:String(publicMessage),
  downloadReady:status === 'fulfilled',
}
```

Reject any unexpected `url`, `providerUrl`, raw Invoice/Payment field, customer email, or accounting identifier before rendering. When `downloadReady` is true, an explicit Download action obtains a ten-minute, owner-bound single-use grant and immediately redeems it through Task 7's authenticated streaming Function. Do not put the nonce in a query string, log, persistent browser storage, analytics event, or reusable public URL; clear it after the one attempt. Wrong-UID, expired, and replay errors return to the safe fulfilled view so the authenticated owner can request a new grant.

- [ ] **Step 5: Preserve fail-closed product buttons**

Enable each purchase button only when the server exposes the matching active SKU. If Functions or App Check is unavailable, show `Purchasing is temporarily unavailable` and do not fall back to mailto, an unverified payment link, or a public file.

- [ ] **Step 6: Run accessibility, mobile, and Hosting-boundary tests**

Confirm keyboard flow, visible focus, labels, error announcements, 390px mobile layout, signed-out/wrong-user status denial, email-link replay denial, single-use download-grant replay denial, and that Functions/tests/private artifacts and both Rules files remain excluded from Hosting.

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

Run: `npm --prefix functions test -- test/commerce/refunds.test.js`

- [ ] **Step 3: Implement admin-only review and reconciliation controls**

Require `admin:true`, App Check, a nonempty bounded reason, integer cents not exceeding the verified unrefunded amount, and stable idempotency. `requestRefundReview()` records an approved internal work item only; it does not call a QuickBooks Payments API or alter QuickBooks. `reconcileRefund()` may transition to `refunded` only after the Accounting adapter re-fetches current documented entities and normalizes exact invoice/payment/refund or reversal evidence for the same realm/order/amount. If the current Accounting documentation does not expose sufficient proof for that processor refund, preserve `paid`/`fulfilled` and require manual accounting review rather than inventing a completed field.

- [ ] **Step 4: Write the operations runbook**

Include identities, scoped commands, sandbox setup, secret names without values, webhook-disabled reconciliation, monitoring queries, invoice-send ambiguity handling, manual-review handling, settlement/deposit verification, the separately approved QuickBooks operator refund procedure, authoritative read-back, outage behavior, rollback, and explicit approval points. State that a refund request is not approval to execute it and an external QuickBooks action is not reconciled until independently verified.

- [ ] **Step 5: Run and commit**

```bash
npm --prefix functions test -- test/commerce/refunds.test.js
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

The final emulator command is a required release gate, but it is currently blocked: this repository has only an unconfigured commerce-deny fragment rather than the authoritative production Firestore Rules source, has no `storage.rules` or configured Storage Rules source, and lacks the required Java/rules-unit-testing proof. Do not represent a static fragment or newly created local deny file as runtime authorization proof. Recover and merge both authoritative production Rules sources and bucket mapping, install/verify Java, then run the full signed-out/ordinary/customer-owner/wrong-customer/admin suite before either Rules release. Missing authoritative Firestore or Storage Rules source is a pilot release blocker.

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

Run published-shape local webhook fixtures for valid signature, invalid signature, changed raw bytes, wrong realm, replay, Invoice hint, and Payment hint. Prove that an accepted webhook does not transition payment until mocked authoritative entity re-fetch passes. Disable the webhook path and prove scheduled reconciliation reaches the same result; then simulate delayed, duplicated, and missed events plus an expired invoice-send claim. Prove that stale send recovery produces `manual_review`/`invoice_send_unknown` and zero additional send calls. Production webhook configuration remains blocked until the owning Intuit Developer app is visible and access/configuration is separately approved; app invisibility does not by itself block a scheduled-reconciliation-only pilot when Accounting OAuth and every other gate pass.

- [ ] **Step 5: Review Firebase packaging**

This repository has no release-guard script. Use these concrete preflight commands and record their output:

```bash
git status --short
git rev-parse HEAD
firebase target --project the-ballers-kingdom --account lilpelejr12@gmail.com
firebase deploy --only functions:ballkingdom-integrations --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run
firebase deploy --only storage --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run
firebase deploy --only hosting:public --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run
```

The Firebase CLI warns that a dry run may enable target-project APIs, so obtain production-impact approval before running these production-targeted preflights. Confirm Hosting maps `public -> ballkingdom-com`, Functions maps only `ballkingdom-integrations`, Storage resolves only the reviewed bucket/rules source, and no private artifact, test fixture, backend source, Rules source, or secret file enters the Hosting manifest.

- [ ] **Step 6: Write verification evidence and commit**

```bash
git add docs/operations/quickbooks-commerce-verification.md
git commit -m "docs: verify QuickBooks commerce release"
```

The evidence must distinguish mocked, local, emulator, Intuit sandbox, signed-in read-only, and production truth. It must list the missing authoritative Firestore and Storage Rules sources/emulator proof as pilot blockers. It must list invisible developer-app ownership specifically as a webhook-configuration blocker, not as a blocker to scheduled reconciliation when the existing Accounting OAuth connection is authoritatively working.

---

### Task 12: Release One Owner-Controlled Digital Pilot

**Files:**
- Modify: `docs/operations/quickbooks-commerce-verification.md`
- Modify only configuration required by the approved pilot SKU.

**Interfaces:**
- Consumes: approved verification evidence and explicit production authorization.
- Produces: one monitored, reversible digital-only production pilot with independent QuickBooks and Firebase proof; no service migration.

- [ ] **Step 1: Obtain explicit approvals**

Require Brian's separate approval for the exact SKU and price/tax/item mapping, Firebase email-link provider configuration if it is not already enabled, production app/webhook configuration if proposed, secret/IAM changes, authoritative Firestore Rules release, authoritative Storage Rules release, scoped Functions deployment, scoped Hosting deployment, enabling only the digital pilot flag, one QuickBooks invoice send, the exact customer email recipient, one low-value owner payment, and any refund. One approval does not imply another. Automatic digital invoice send remains disabled until these pilot approvals are recorded; the service migration flag remains false.

- [ ] **Step 2: Verify identity, target, commit, and rollback**

Read back Firebase account/project/targets, Firebase email-link provider state, QuickBooks company/realm and working Accounting OAuth read, the visible owning Intuit app only if webhooks are part of the pilot, Git commit, authoritative Firestore and Storage Rules sources/hashes and bucket mapping, Java emulator evidence, both false-by-default flag values, clean source packaging, existing live versions, and rollback commands before mutation. If either authoritative Rules source or emulator proof is incomplete, do not deploy the pilot. If the production app is still invisible, do not configure or deploy the webhook, but the pilot may proceed with mandatory scheduled reconciliation when Accounting OAuth and every other gate passes.

- [ ] **Step 3: Deploy Rules separately only after their approvals**

After the matching authoritative-source hashes and emulator evidence are recorded, use separate approvals and separate scoped commands:

```bash
firebase deploy --only firestore:rules --project the-ballers-kingdom --account lilpelejr12@gmail.com
firebase deploy --only storage --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

Before each command, confirm its Firebase CLI dry run and exact diff. After each command, read back/emulator-smoke-test the intended signed-out, customer-owner, wrong-customer, and admin behavior before continuing. The Storage deployment is not implied by Firestore approval. If the authoritative production Storage Rules source/bucket mapping is missing or Storage emulator proof is incomplete, stop: the pilot is blocked, and no Rules release or digital enablement may be claimed.

- [ ] **Step 4: Deploy Functions only after approval**

Run the exact approved preflight and scoped command for `functions:ballkingdom-integrations`. Deploy with `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED` still false and `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`. Deploy no webhook verifier-token binding or endpoint configuration unless the owning app is visible and the exact configuration is approved. Smoke-test signed-out, wrong-UID, unverified-email, and App Check denial plus scheduled reconciliation before enabling any product.

- [ ] **Step 5: Enable one pilot SKU and digital flag; deploy Hosting only after approval**

Activate only the approved SKU and set only `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=true`; leave `COMMERCE_SERVICE_QBO_SEND_ENABLED=false` so existing service behavior remains unchanged. Rerun the entire relevant test set, run and review the approved `firebase deploy --only functions:ballkingdom-integrations --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run`, then perform the separately approved scoped Functions deploy that applies the digital flag. Run and review the concrete approved `firebase deploy --only hosting:public --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run`, then deploy only `hosting:public` to `ballkingdom-com`. Confirm `storage.rules` and private artifacts are absent from the Hosting manifest, read back both flag values, and prove the service path still uses its existing behavior before submitting the digital order.

- [ ] **Step 6: Send one approved QuickBooks invoice and customer email**

Authenticate the approved customer with Firebase email link, submit the approved digital order once, and verify the immutable `customerUid`/verified-email mapping exists before the invoice effect. Verify one server-priced QuickBooks Invoice, one stored invoice ID/order reference, one documented QuickBooks invoice-send response, and one customer email at the exact approved address. The response and email prove neither delivery nor payment. If the send outcome is ambiguous or its five-minute claim expires, confirm scheduled recovery puts it in `manual_review` with `invoice_send_unknown` and do not resend blindly.

- [ ] **Step 7: Run one approved low-value owner payment**

Pay through a method QuickBooks presents in its invoice email; use ACH only if QuickBooks exposes it on that invoice. Verify exact realm, Invoice ID/order reference/`TotalAmt`/currency/zero `Balance`/present-paid state and exactly one present Payment with exact `TotalAmt`, zero `UnappliedAmt`, no deleted/voided status, and one full `LinkedTxn` application only to that Invoice. Then verify Firebase state/audit plus authenticated, same-UID, ten-minute, single-use protected fulfillment from independent sources. Also inspect QuickBooks Payments and the settlement/deposit view. Do not treat the website, email, webhook, Invoice send response, Invoice balance alone, or an invented provider `completed` value as confirmation.

- [ ] **Step 8: Execute an approved refund if requested**

Perform the refund in QuickBooks only after its separate approval. Verify it independently in QuickBooks Payments, QuickBooks accounting, Firebase audit state, and the original payment method. If Accounting entities cannot prove the refund under the documented contract, retain manual review and do not manufacture `refunded`. Do not refund automatically merely because the owner payment succeeded.

- [ ] **Step 9: Record the measured result**

Update the verification document with non-secret timestamps, identifiers truncated to safe suffixes, observed behavior, both feature-flag values, scheduled-reconciliation evidence, authenticated grant expiry/replay results, rollback status, and remaining rollout gates. Commit the evidence without private customer or payment data. Keep the service flag false until a separately approved release.

---

## Completion Criteria

- The existing Accounting adapter creates one deterministic invoice, invokes only the documented Invoice send operation, and returns no provider pay URL.
- Digital products cannot fulfill until exact realm, Invoice ID/order reference/total/currency/balance/status and Payment total/unapplied amount/status/sole full Invoice application are independently re-fetched and verified.
- Customer order status and downloads require the immutable Firebase email-link-authenticated `customerUid`; App Check and a non-secret order handle alone are insufficient. Download grants are ten-minute, digest-only, and atomically single-use.
- Services retain Brian's invoice creation/send approval gate and current Graph/PDF path while the service migration flag is false; a separately approved migration may reconcile paid invoices through the same verifier.
- PayPal/Venmo remain QuickBooks-presented methods; no standalone wallet pipeline exists.
- QuickBooks remains the authoritative accounting record.
- All direct commerce collections and paid artifacts are denied to public clients.
- Valid webhooks create hints only; invalid signatures/realms are rejected; every transition uses authoritative re-fetch.
- Scheduled reconciliation recovers correctly with webhooks unavailable, delayed, duplicated, or missed.
- Firebase Auth ownership, App Check, admin authorization, five-minute invoice/effect leases, stale-send quarantine/no-resend, grant replay protection, redaction, reconciliation, and refund-review limits pass automated tests.
- The authoritative production Firestore and Storage Rules sources/bucket mapping are recovered/merged and the Java rules-unit-testing emulator suite passes; the current Firestore fragment, absent Storage source, and static checks are insufficient.
- The owning Intuit Developer app is visible and approved before any production webhook configuration; otherwise scheduled reconciliation is the enabled recovery path and may support the digital pilot when Accounting OAuth and every other gate pass.
- Both rollout flags default false; Task 12 enables only the digital flag and leaves service behavior unchanged until separately approved.
- Mocked, local, emulator, Accounting sandbox, dependency, secret, Hosting-boundary, and browser verification pass without an unapproved invoice/email/payment/refund.
- Production remains fail-closed until each scoped deployment, one QuickBooks invoice send/customer email, owner payment, and optional refund receives its own explicit approval and independent verification.

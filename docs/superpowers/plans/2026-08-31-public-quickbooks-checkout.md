# Public QuickBooks Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch a nationwide public $49 Home Inspection Study Guide checkout that uses Firebase email verification, QuickBooks invoices with card/Apple Pay/PayPal/Venmo options, authoritative payment verification, and protected PDF delivery.

**Architecture:** Generalize the existing owner-pilot commerce path without replacing its fail-closed boundaries. Public customers receive only server-generated transactional authentication and QuickBooks invoice messages; verified Firebase identity owns one deterministic active order per SKU, QuickBooks remains the payment/accounting authority, and the existing single-use protected stream remains the fulfillment boundary. Code deploys inactive first, a controlled owner transaction validates the production path, and only then may the public flag and catalog gates be activated.

**Tech Stack:** Firebase Hosting, Firebase Functions v2 on Node.js 22, Firebase Auth email links, Firebase App Check/reCAPTCHA Enterprise, Firestore transactions and Rules emulator, Cloud Storage, Microsoft Graph, QuickBooks Online Accounting/Payments, vanilla browser JavaScript, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-public-quickbooks-checkout-design.md`

## Global Constraints

- Firebase project/account are always explicit: `--project the-ballers-kingdom --account lilpelejr12@gmail.com`.
- Hosting target is `public → ballkingdom-com`; never deploy the redirect target during this work.
- Public digital commerce is default-off and fails closed until every catalog and release gate is true.
- `COMMERCE_SERVICE_QBO_SEND_ENABLED=false` remains unchanged.
- Only the Firebase sign-in email from `info@ballkingdom.com` and QuickBooks customer invoice email are authorized for automated public checkout delivery.
- No standalone Apple Pay, PayPal, or Venmo API and no website handling of payment credentials.
- Home Inspection Study Guide is exactly `$49.00`, USD, QuickBooks item ID `8`, electronic-only, tax code `NON`, with no geographic restriction by owner decision.
- Apple Pay is accepted only through a QuickBooks e-invoice with card payments and online invoice delivery enabled and surcharging off.
- QuickBooks webhooks remain hints; fulfillment requires independently fetched exact Accounting evidence.
- Existing Auth revocation checks, App Check enforcement/limited-use consumption, exact-origin CORS, Storage denial, immutable artifact identity, and single-use grant controls remain intact.
- Ambiguous provider actions are quarantined and never automatically retried.
- A real owner transaction, outbound message, invoice, payment, refund, or customer communication requires the action-time gate stated in Task 7.
- Preserve unrelated dirty files and worktrees; stage only task-owned files.

---

### Task 1: Public catalog, tax decision, and feature gate

**Files:**
- Modify: `functions/src/commerce/catalog.js`
- Modify: `functions/src/commerce/feature-flags.js`
- Modify: `functions/.env.the-ballers-kingdom`
- Modify: `functions/test/commerce/catalog.test.js`
- Modify: `functions/test/commerce/feature-flags.test.js`
- Modify: `docs/operations/home-inspection-commerce-pilot-evidence.md`

**Interfaces:**
- Consumes: existing `isCommerceItemPurchasable(item)` and `readCommerceFeatureFlags()`.
- Produces: `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED` and `readCommerceFeatureFlags().publicDigitalCheckoutEnabled: boolean`; reviewed catalog metadata with `tax.accountantVerified:true`, `release.fulfillmentRuntimeVerified:true`, while `active` and `release.deployApproved` stay false during code deployment.

- [ ] **Step 1: Write failing catalog and flag tests**

```js
test('records owner-approved nationwide electronic-only NON treatment', () => {
  const item = getConfiguredCommerceItem('home-inspection-study-guide');
  assert.equal(item.delivery, 'electronic_only');
  assert.equal(item.physicalCopyIncluded, false);
  assert.equal(item.tax.quickBooksTaxCode, 'NON');
  assert.equal(item.tax.accountantVerified, true);
  assert.equal(item.tax.geographicRestriction, 'none_owner_approved');
  assert.equal(item.release.fulfillmentRuntimeVerified, true);
  assert.equal(item.active, false);
  assert.equal(item.release.deployApproved, false);
});

test('public digital checkout flag defaults false independently', () => {
  const flags = readCommerceFeatureFlags({
    publicDigitalCheckoutParam:{value:()=>false},
    serviceQboSendParam:{value:()=>false},
  });
  assert.deepEqual(flags, {publicDigitalCheckoutEnabled:false,serviceQboSendEnabled:false});
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `cd functions && PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test test/commerce/catalog.test.js test/commerce/feature-flags.test.js`

Expected: FAIL because the public flag and reviewed nationwide metadata do not exist.

- [ ] **Step 3: Implement the reviewed configuration without activating sales**

```js
export const COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED = defineBoolean(
  'COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED', {default:false},
);

export function readCommerceFeatureFlags({
  publicDigitalCheckoutParam=COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED,
  serviceQboSendParam=COMMERCE_SERVICE_QBO_SEND_ENABLED,
}={}) {
  return Object.freeze({
    publicDigitalCheckoutEnabled: publicDigitalCheckoutParam.value() === true,
    serviceQboSendEnabled: serviceQboSendParam.value() === true,
  });
}
```

Update the item metadata exactly as tested, but keep `active:false` and `deployApproved:false`. Replace the obsolete pilot flag entry with `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false`; retain `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`.

- [ ] **Step 4: Record source and owner decisions**

Add a dated evidence entry identifying CDTFA Publication 109, Brian's report of accountant confirmation for California, nationwide `NON` as an owner-approved residual risk, electronic-only/no-tangible-copy constraint, and the Intuit Apple Pay requirements. Do not claim professional verification outside California.

- [ ] **Step 5: Run tests and commit**

Run: `cd functions && PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test test/commerce/catalog.test.js test/commerce/feature-flags.test.js && npm run check`

Expected: PASS, with both runtime flags false.

```bash
git add functions/src/commerce/catalog.js functions/src/commerce/feature-flags.js functions/.env.the-ballers-kingdom functions/test/commerce/catalog.test.js functions/test/commerce/feature-flags.test.js docs/operations/home-inspection-commerce-pilot-evidence.md
git commit -m "feat: define public digital checkout gates"
```

### Task 2: Public authentication abuse boundary

**Files:**
- Create: `functions/src/commerce/public-auth-limits.js`
- Modify: `functions/src/commerce/commerce-service.js`
- Modify: `functions/src/commerce/order-repository.js`
- Modify: `functions/src/index.js`
- Create: `functions/test/commerce/public-auth-limits.test.js`
- Modify: `functions/test/commerce/commerce-service.test.js`
- Modify: `functions/test/commerce/order-repository.test.js`

**Interfaces:**
- Consumes: App Check context, normalized email, request metadata reduced to a trusted network digest and an app-global App Check identifier, existing leased email effects and Graph sender. App Check `appId` is not a device identifier.
- Produces: `createPublicAuthLimiter({repository,clock})` with `consume({emailDigest,ipDigest,appId}): Promise<boolean>`; service method `requestPublicSignInLink(input, context): Promise<{status:'request_received'}>`. The deployed callable keeps the compatibility-stable export name `requestPilotSignInLink` and delegates only to this new public method, avoiding a destructive Function rename.

- [ ] **Step 1: Write failing public-auth limit tests**

```js
test('allows bounded distinct public recipients without an allowlist', async () => {
  const limiter=createPublicAuthLimiter({repository:memoryLimits(),clock:()=>new Date(0)});
  assert.equal(await limiter.consume({emailDigest:'a'.repeat(64),ipDigest:'b'.repeat(64),appId:'web'}),true);
  assert.equal(await limiter.consume({emailDigest:'c'.repeat(64),ipDigest:'b'.repeat(64),appId:'web'}),true);
});

test('fails closed on email, IP, or independently reachable app-global exhaustion', async () => {
  const limiter=createPublicAuthLimiter({repository:memoryLimits({emailCount:5}),clock:()=>new Date(0)});
  assert.equal(await limiter.consume({emailDigest:'a'.repeat(64),ipDigest:'b'.repeat(64),appId:'web'}),false);
});
```

Add service tests proving malformed, extra-field, invalid-email, rate-limited, or App-Check-missing requests return the identical generic result and cause no Admin Auth, repository effect, or Graph call. Add parallel and bounded-reissue tests for two unrelated public emails.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd functions && PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test test/commerce/public-auth-limits.test.js test/commerce/commerce-service.test.js test/commerce/order-repository.test.js`

Expected: FAIL because public limiter/service interfaces are absent and the pilot allowlist rejects public recipients.

- [ ] **Step 3: Implement transactional multi-dimensional limits**

```js
export function createPublicAuthLimiter({repository,clock=()=>new Date()}={}) {
  if (!repository?.consumePublicAuthLimits) throw new Error('Public auth limiter repository is required');
  return Object.freeze({
    consume({emailDigest,ipDigest,appId}) {
      return repository.consumePublicAuthLimits({
        emailDigest,ipDigest,appId,now:clock(),windowMs:10*60*1000,
        emailLimit:5,ipLimit:20,appGlobalLimit:250,
      });
    },
  });
}
```

Store fixed-window counters under deterministic digest documents in one transaction. Never store raw IP addresses in rate-limit documents. Reject absent/malformed trusted request metadata before generating a link.

- [ ] **Step 4: Generalize email effects safely**

Rename pilot-only effect helpers to public digital-auth names while retaining compatibility readers for already-created pilot effects. Bind effects to `sha256(normalizedEmail + sku + purpose + issuanceBucket)`; permit at most five completed reissues, deduplicate parallel requests, and keep post-dispatch ambiguity permanently in `manual_review`.

- [ ] **Step 5: Replace allowlist enforcement only on the digital path**

`requestPublicSignInLink` accepts any syntactically valid normalized email after App Check and limits. `createDigitalOrder` later trusts only the authoritative Firebase user email. Keep the deployed `requestPilotSignInLink` callable name as a compatibility adapter, but remove its dependency on the recipient secret. Do not remove the pilot secret or allowlist from unrelated flows.

- [ ] **Step 6: Run tests and commit**

Run the focused command from Step 2, then `cd functions && npm run check`.

Expected: PASS with generic responses and zero provider calls for rejected traffic.

```bash
git add functions/src/commerce/public-auth-limits.js functions/src/commerce/commerce-service.js functions/src/commerce/order-repository.js functions/src/index.js functions/test/commerce/public-auth-limits.test.js functions/test/commerce/commerce-service.test.js functions/test/commerce/order-repository.test.js
git commit -m "feat: secure public commerce sign-in"
```

### Task 3: Public order uniqueness and QuickBooks payment capability

**Files:**
- Modify: `functions/src/commerce/commerce-service.js`
- Modify: `functions/src/commerce/order-repository.js`
- Modify: `functions/src/providers/quickbooks.js`
- Modify: `functions/src/providers/quickbooks-payments-capability.js`
- Modify: `functions/test/commerce/commerce-service.test.js`
- Modify: `functions/test/commerce/order-repository.test.js`
- Modify: `functions/test/commerce/quickbooks-invoices.test.js`
- Modify: `functions/test/commerce/quickbooks-payments-capability.test.js`

**Interfaces:**
- Consumes: authoritative Firebase identity `{uid,email,emailVerified,disabled}`, configured catalog item, public feature flag, existing QuickBooks credential coordinator.
- Produces: deterministic `reservePublicDigitalOrder({customerBinding,sku,orderId,order})`; payment capability `{mode,supportsImmediatePayment,supportsCards,supportsApplePay,supportsPayPal,supportsAch,supportsWebhooks,surchargingEnabled,onlineInvoiceDelivery}`.

- [ ] **Step 1: Write failing capability and uniqueness tests**

```js
test('requires Apple Pay-compatible QuickBooks invoice settings', () => {
  assert.deepEqual(assertPaymentsCapability(verifiedConfig()), {
    mode:'documented-intuit-flow',supportsImmediatePayment:true,supportsCards:true,
    supportsApplePay:true,supportsPayPal:true,supportsAch:true,supportsWebhooks:true,
    surchargingEnabled:false,onlineInvoiceDelivery:true,
  });
});

test('parallel public orders reserve one active order per customer and SKU', async () => {
  const results=await Promise.all(Array.from({length:3},()=>repository.reservePublicDigitalOrder(input)));
  assert.equal(new Set(results.map(result=>result.orderId)).size,1);
});
```

Add tests that a second browser idempotency key, changed customer name, or concurrent request cannot create another active invoice. A paid/fulfilled order remains resumable. A cancelled/refunded terminal order requires an explicit new-purchase rule rather than silent reuse.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd functions && PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test test/commerce/quickbooks-payments-capability.test.js test/commerce/quickbooks-invoices.test.js test/commerce/order-repository.test.js test/commerce/commerce-service.test.js`

Expected: FAIL on missing Apple Pay fields and public reservation interface.

- [ ] **Step 3: Expand strict capability validation**

```js
const BOOLEAN_KEYS=['supportsImmediatePayment','supportsCards','supportsApplePay','supportsPayPal',
  'supportsAch','supportsWebhooks','surchargingEnabled','onlineInvoiceDelivery'];
for (const key of BOOLEAN_KEYS) if (typeof config[key] !== 'boolean') {
  throw new Error(`Payments capability ${key} must be boolean`);
}
if (!config.supportsCards || !config.supportsApplePay || config.surchargingEnabled
  || !config.onlineInvoiceDelivery) throw new Error('Apple Pay invoice capability is unavailable');
```

Capability evidence is a release gate, not a claim that the Accounting API itself selects Apple Pay. QuickBooks invoice/account settings control customer presentation.

- [ ] **Step 4: Implement deterministic public reservation**

Use a one-way customer binding from the authoritative normalized email and SKU. Reserve or read the matching active order transactionally before any provider call. Continue using the stable QuickBooks order reference and existing create/send lease recovery.

- [ ] **Step 5: Remove owner allowlist from order creation**

Require the independently verified Firebase user to be enabled and email-verified. Bind the order to `uid`, authoritative normalized email digest, and SKU. Ignore browser email/UID/amount/tax/item/provider fields. Gate on `publicDigitalCheckoutEnabled` and the purchasable catalog predicate.

- [ ] **Step 6: Assert exact invoice construction**

Tests must prove every public invoice uses amount `4900`, currency `USD`, item ID `8`, one unit, tax code `NON`, customer email from authoritative Auth, and online payment delivery. Assert no browser-controlled payment options enter the provider request.

- [ ] **Step 7: Run tests and commit**

Run the focused command from Step 2 and `cd functions && npm run check`.

```bash
git add functions/src/commerce/commerce-service.js functions/src/commerce/order-repository.js functions/src/providers/quickbooks.js functions/src/providers/quickbooks-payments-capability.js functions/test/commerce/commerce-service.test.js functions/test/commerce/order-repository.test.js functions/test/commerce/quickbooks-invoices.test.js functions/test/commerce/quickbooks-payments-capability.test.js
git commit -m "feat: create idempotent public QuickBooks orders"
```

### Task 4: Public checkout browser experience

**Files:**
- Modify: `order-status.html`
- Modify: `assets/js/commerce-client.js`
- Modify: `assets/js/firebase-commerce-runtime.js`
- Modify: `assets/css/styles.css`
- Modify: `tests/commerce-browser.spec.mjs`
- Modify: `tests/firebase-commerce-runtime.test.mjs`
- Modify: `tests/storefront-html.test.mjs`

**Interfaces:**
- Consumes: `getBuyerCommerceCapability`, the compatibility-stable callable `requestPilotSignInLink` exposed to the browser as boundary method `requestPublicSignInLink`, `completeEmailLink`, `createDigitalOrder`, `getOrderStatus`, protected grant/redeem functions.
- Produces: accessible public checkout UI and resume flow with no payment credential fields.

- [ ] **Step 1: Write failing browser/content tests**

```js
test('public customer completes verified invoice flow without payment fields', async ({page}) => {
  await page.goto('/order-status.html?sku=home-inspection-study-guide');
  await expect(page.getByText('$49.00')).toBeVisible();
  await expect(page.getByText(/Apple Pay/)).toBeVisible();
  await expect(page.locator('input[type=card], input[name*=card], input[name*=paypal]')).toHaveCount(0);
  await page.getByLabel('Email').fill('customer@example.test');
  await page.getByRole('button',{name:/email.*sign-in link/i}).click();
  await expect(page.getByText(/request has been received/i)).toBeVisible();
});
```

Add tests for returning-order resume, link expiry, rate-limited generic response, disabled checkout, duplicate clicks, small screens, keyboard focus, error messaging, refund link, Apple Pay Safari/device qualification copy, and no local/session/token persistence.

- [ ] **Step 2: Run browser/unit tests and confirm RED**

Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx playwright test tests/commerce-browser.spec.mjs && node --test tests/firebase-commerce-runtime.test.mjs tests/storefront-html.test.mjs`

Expected: FAIL because the page still presents pilot language and calls the pilot function.

- [ ] **Step 3: Implement public copy and form state**

Show exact server capability, price, electronic delivery, refund terms, QuickBooks invoice behavior, and supported methods. Say Apple Pay availability depends on an eligible Apple device/card and Safari. Never claim a specific method is guaranteed on every customer device.

- [ ] **Step 4: Wire public Auth and order calls**

Rename the browser boundary to `requestPublicSignInLink`. Preserve in-memory Auth, exact response validation, no automatic retries, separate resume versus create behavior, and safe generic failures. Disable duplicate submissions while a request is in flight and restore controls on bounded failure.

- [ ] **Step 5: Preserve protected delivery**

Run the existing 28-case protected browser suite unchanged, then add a public-customer paid-order case that creates a fresh grant, consumes a limited-use App Check token, downloads the exact PDF filename through a temporary object URL, and revokes it.

- [ ] **Step 6: Run tests, visual QA, and commit**

Run the command from Step 2 plus `npm run test:storefront`. Capture desktop and 390px screenshots locally and inspect focus, overflow, payment-method copy, and disabled/error states.

```bash
git add order-status.html assets/js/commerce-client.js assets/js/firebase-commerce-runtime.js assets/css/styles.css tests/commerce-browser.spec.mjs tests/firebase-commerce-runtime.test.mjs tests/storefront-html.test.mjs
git commit -m "feat: add public digital checkout experience"
```

### Task 5: End-to-end payment and fulfillment regression boundary

**Files:**
- Modify: `functions/test/commerce/commerce-service.test.js`
- Modify: `functions/test/commerce/quickbooks-webhooks.test.js`
- Modify: `functions/test/commerce/fulfillment.test.js`
- Modify: `functions/test/commerce/download-http.test.js`
- Modify: `functions/test/commerce/download-function-contract.test.js`
- Modify: `firestore.rules`
- Modify: `storage.rules`
- Modify: `functions/test/commerce/firestore-rules.test.js`
- Modify: `functions/test/commerce/storage-rules.test.js`

**Interfaces:**
- Consumes: public order records, QuickBooks reconciliation hints, exact Accounting reader, fulfillment grant runtime.
- Produces: emulator-backed proof that public identities cannot bypass ownership/payment/private-storage controls.

- [ ] **Step 1: Add failing public end-to-end security tests**

```js
test('public fulfilled order requires exact Accounting evidence before grant', async () => {
  const unpaid=await service.createDigitalOrder(publicOrderInput, verifiedPublicAuth);
  await assert.rejects(()=>fulfillment.createDownloadGrant({orderId:unpaid.orderHandle}, verifiedPublicContext),/not fulfilled/i);
  await reconcileExactPayment(unpaid.orderHandle);
  const grant=await fulfillment.createDownloadGrant({orderId:unpaid.orderHandle}, verifiedPublicContext);
  assert.match(grant.grant,/^[A-Za-z0-9_-]{43}$/);
});
```

Add cross-customer status/grant denial, forged webhook, wrong realm/customer/item/amount/currency, partial/refunded/cancelled, replay, App Check replay, direct Storage, and admin denial cases.

- [ ] **Step 2: Run focused tests and confirm RED where public fixtures are unsupported**

Run: `cd functions && PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test test/commerce/commerce-service.test.js test/commerce/quickbooks-webhooks.test.js test/commerce/fulfillment.test.js test/commerce/download-http.test.js test/commerce/download-function-contract.test.js`

- [ ] **Step 3: Make only necessary rule/runtime corrections**

Rules must keep order writes server-only and private artifacts unreadable to every direct Storage client, including authenticated owners and admins. Do not add browser Firestore access for checkout state.

- [ ] **Step 4: Run emulator and full security suites**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" firebase emulators:exec --only firestore,storage \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com \
  'cd functions && PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test'
```

Expected: no skipped emulator Rules tests and zero failures.

- [ ] **Step 5: Commit**

```bash
git add functions/test/commerce/commerce-service.test.js functions/test/commerce/quickbooks-webhooks.test.js functions/test/commerce/fulfillment.test.js functions/test/commerce/download-http.test.js functions/test/commerce/download-function-contract.test.js firestore.rules storage.rules functions/test/commerce/firestore-rules.test.js functions/test/commerce/storage-rules.test.js
git commit -m "test: verify public payment fulfillment boundary"
```

### Task 6: Release evidence, operational controls, and inactive deployment package

**Files:**
- Create: `docs/operations/public-quickbooks-checkout-release.md`
- Modify: `docs/operations/quickbooks-commerce-capability-evidence.md`
- Modify: `firebase.json` only if the Hosting exclusion regression test proves a missing exclusion.
- Modify: `tests/storefront-html.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–5 and read-only production QuickBooks/Firebase evidence.
- Produces: reviewed release manifest, capability evidence, rollback commands, and inactive deploy approval packet.

- [ ] **Step 1: Add failing packaging and gate tests**

```js
test('public checkout release keeps private and backend files off Hosting', async () => {
  const config=JSON.parse(await read('firebase.json'));
  const target=config.hosting.find(entry=>entry.target==='public');
  for (const pattern of ['functions/**','tests/**','docs/**','firestore.rules','storage.rules']) {
    assert.ok(target.ignore.includes(pattern),pattern);
  }
});
```

Add a source inventory assertion for the exact reviewed Function export list and explicit exclusion of `confirmAcceptedBooking`.

- [ ] **Step 2: Perform read-only QuickBooks capability review**

Using the existing signed-in QuickBooks session, verify and record without changing settings:

- QuickBooks Payments remains active for the correct company;
- online invoice delivery is enabled;
- card payments are enabled;
- Apple Pay appears as an invoice card payment option;
- PayPal/Venmo remain enabled;
- surcharging is off for the representative invoice path;
- item ID `8`, name, price, income account, and `NON` mapping are exact.

If any item is false, stop. Changing a QuickBooks setting requires a new action-time approval.

- [ ] **Step 3: Run complete verification**

Run root install/tests, protected commerce Playwright tests, Functions install/test/check, both emulator suites, `npm audit --omit=dev` in both roots, the secure repository checker, and `git diff --check origin/main..HEAD`. Record exact totals and dependency disposition without secrets.

- [ ] **Step 4: Write rollback and deploy manifest**

Record the pre-feature merge commit, exact existing Function allowlist plus any renamed public callable export, Hosting `public`, explicit project/account, flag-off deployment, emergency-disable-first rollback, and destructive function-deletion approval boundary.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/operations/public-quickbooks-checkout-release.md docs/operations/quickbooks-commerce-capability-evidence.md firebase.json tests/storefront-html.test.mjs
git commit -m "docs: verify public QuickBooks checkout release"
```

### Task 7: Reviewed release, controlled owner purchase, and public activation

**Files:**
- Modify: `functions/.env.the-ballers-kingdom` during the reviewed activation commit.
- Modify: `functions/src/commerce/catalog.js` during the reviewed activation commit.
- Modify: `docs/operations/public-quickbooks-checkout-release.md` after each production readback.

**Interfaces:**
- Consumes: merged implementation PR, exact inactive deploy manifest, QuickBooks capability readback, explicit action-time transaction approval.
- Produces: live public checkout, verified owner transaction, final evidence PR, and durable non-secret ECOAI milestone.

- [ ] **Step 1: Obtain independent whole-branch review**

Review `origin/main..HEAD` against the spec and this plan. Fix every Critical and Important finding test-first; document or fix Minor findings. Rerun the complete Task 6 gate after the final code commit.

- [ ] **Step 2: Merge through normal PR/CI**

Push the feature branch, create a PR to `main`, inspect the exact changed-file list and checks, and merge only the reviewed commit. Create a clean detached release worktree from the merge commit and reinstall locked dependencies.

- [ ] **Step 3: Deploy code inactive**

Deploy only the documented exact Function allowlist and `hosting:public`, with:

```bash
firebase deploy --only functions:requestPilotSignInLink,functions:createDigitalOrder,functions:getOrderStatus,functions:getBuyerCommerceCapability,functions:verifyOrderPayment,functions:getCommerceReleaseState,functions:requestRefundReview,functions:reconcileOrder,functions:reconcileRefund,functions:quickBooksCommerceWebhook,functions:reconcileCommerceOrders,functions:dispatchCommerceEffects,functions:stageInvoiceApprovals,functions:approveInvoice,functions:beginQuickBooksConnection,functions:quickBooksOAuthCallback,functions:beginMicrosoftConnection,functions:microsoftOAuthCallback,functions:createDownloadGrant,functions:redeemDownloadGrant,hosting:public \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

Both public digital checkout and service invoice flags remain false. Read back Functions, runtime identities, Hosting assets/headers, App Check, IAM, private object metadata, unauthenticated/wrong-origin denial, and direct Storage denial.

- [ ] **Step 4: Stop for action-time controlled transaction approval**

Present the exact owner test email, the two messages that will be sent, the $49 QuickBooks invoice, available payment methods including Apple Pay conditions, expected real charge/processing fee, and refund/void recovery plan. Do not send the sign-in link or create/send the invoice until Brian approves that exact transaction.

- [ ] **Step 5: Execute and verify one controlled owner purchase**

After approval, request one sign-in link, complete Auth, create one invoice, pay it using the chosen QuickBooks-presented method, and independently verify the exact QuickBooks Payment/Invoice evidence before downloading the generation-pinned PDF. Confirm one auth email, one invoice, one order, one payment, one fulfillment, and no duplicate provider action.

- [ ] **Step 6: Create the activation commit and obtain deploy approval**

Set only:

```text
COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=true
```

and the Home Inspection item gates:

```js
active:true,
release:{...existingRelease,fulfillmentRuntimeVerified:true,deployApproved:true}
```

Keep `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`. Run the full gate, open a focused activation PR, obtain independent review, merge it, and ask Brian for explicit production deploy approval describing that future customer-triggered sign-in and QuickBooks invoice emails will begin automatically.

- [ ] **Step 7: Deploy activation and verify public production behavior**

From the exact activation merge commit, deploy only affected Functions and `hosting:public` using explicit project/account. Verify public capability is active, page copy and price are exact, rejected traffic stays generic, a synthetic/emulator path proves limits without sending, and production logs show no unexpected sends or duplicate orders. Do not create a second real invoice as a smoke test.

- [ ] **Step 8: Merge final evidence and update durable memory**

Record merge commits, exact deploy inventory, controlled transaction identifiers in redacted form, QuickBooks capability evidence, activation readbacks, zero duplicate actions, rollback commit, and residual nationwide tax decision. Merge evidence through a normal PR and run:

```bash
ecoai remember "Ballers Kingdom public QuickBooks checkout deployed; exact runtime and rollback commits are recorded in docs/operations/public-quickbooks-checkout-release.md; owner transaction verified; public flag active; Apple Pay/card/PayPal-Venmo via QuickBooks; service flag false; protected fulfillment verified."
```

Do not include customer email, invoice number, payment ID, tokens, or secrets in durable memory.

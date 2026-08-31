# Protected Commerce Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing Firebase commerce domain to a real browser Auth/App Check runtime and a single-use, generation-pinned private PDF download without activating checkout or sending any message.

**Architecture:** A focused browser module owns Firebase Web SDK initialization and token production. A callable issues hashed ten-minute grants, while a separate HTTPS Function verifies a Firebase ID token, consumes a limited-use App Check token, atomically consumes the grant, and streams the exact private object through the server. The existing commerce client holds the raw grant only in memory and downloads a validated PDF blob.

**Tech Stack:** Static ES modules, Firebase Web SDK, Firebase Admin Auth/App Check/Storage, Cloud Functions v2, Firestore transactions, Node 22 test runner, Playwright, Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-08-31-protected-commerce-delivery-design.md`

## Global Constraints

- Production project is `the-ballers-kingdom`; every Firebase command must specify `--project the-ballers-kingdom --account lilpelejr12@gmail.com`.
- Do not use the ambient Firebase default project.
- Keep `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=false` and `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`.
- Keep catalog `active:false`, `tax.accountantVerified:false`, and `release.deployApproved:false`.
- Never log or persist ID tokens, App Check tokens, raw download grants, email action links, full email addresses, private object URLs, or secret values.
- Never expose a public or signed Storage URL.
- No authentication email, QuickBooks invoice email, customer, invoice, payment, refund, or provider mutation is authorized by this plan.
- Use Node `v22.23.2` through `/opt/homebrew/opt/node@22/bin`.
- Exclude the legacy `confirmAcceptedBooking` trigger from any scoped Functions release.

---

### Task 1: Firebase browser identity and attestation runtime

**Files:**
- Create: `assets/js/firebase-commerce-runtime.js`
- Modify: `order-status.html`
- Create: `tests/firebase-commerce-runtime.test.mjs`

**Interfaces:**
- Consumes: authoritative public Firebase Web App config and the registered reCAPTCHA Enterprise site key for `the-ballers-kingdom`.
- Produces: `window.__BALLERS_FIREBASE_RUNTIME__` with `getAppCheckToken()`, `getLimitedUseAppCheckToken()`, `getIdToken()`, and `completeEmailLink({email})`.

- [ ] **Step 1: Retrieve only authoritative public configuration metadata**

Run read-only Firebase/GCloud commands that return the selected Web App identity, SDK config, and App Check registration metadata. Redact CLI output from evidence if it contains credential-like public identifiers; do not store command output verbatim. Confirm the selected app belongs to `the-ballers-kingdom` and the site key is registered for the canonical domain.

- [ ] **Step 2: Write failing runtime contract tests**

Create tests that import a runtime factory with injected Firebase SDK functions and assert:

```js
const runtime=createFirebaseCommerceRuntime({
  location:{href:'https://ballkingdom.com/order-status.html?mode=signIn&oobCode=one-time'},
  history:{replaceState(...args){historyCalls.push(args);}},
  sdk,
  firebaseConfig:verifiedPublicConfig,
  recaptchaEnterpriseSiteKey:'registered-public-site-key',
});
assert.equal(typeof runtime.getAppCheckToken,'function');
assert.equal(typeof runtime.getLimitedUseAppCheckToken,'function');
assert.deepEqual(await runtime.completeEmailLink({email:'buyer@example.test'}),{signedIn:true});
assert.equal(historyCalls.length,1);
assert.doesNotMatch(historyCalls[0][2],/oobCode|mode=signIn/);
```

Also assert invalid links, mismatched/blank emails, absent current users, empty tokens, and unexpected SDK response shapes fail with generic errors and never write local/session storage.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test tests/firebase-commerce-runtime.test.mjs
```

Expected: fail because `firebase-commerce-runtime.js` and its factory do not exist.

- [ ] **Step 4: Implement the minimal runtime**

Use pinned Firebase modular Web SDK imports. Initialize `initializeApp`, `getAuth`, and `initializeAppCheck(new ReCaptchaEnterpriseProvider(siteKey), {isTokenAutoRefreshEnabled:true})` once. Implement ordinary `getToken`, limited-use `getLimitedUseToken`, current-user `getIdToken(true)`, and `isSignInWithEmailLink` plus `signInWithEmailLink`. Replace only the action parameters in browser history after success. Export the factory for tests and install the frozen runtime on `window` in production.

- [ ] **Step 5: Load the runtime before the commerce client**

Add the runtime module to `order-status.html` before `commerce-client.js`. Do not inline configuration into HTML, expose it through query parameters, or add a direct email sender.

- [ ] **Step 6: Run focused and storefront tests**

Run the runtime test and `npm run test:storefront:unit`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add assets/js/firebase-commerce-runtime.js order-status.html tests/firebase-commerce-runtime.test.mjs
git commit -m "feat: add Firebase commerce browser runtime"
git push
```

---

### Task 2: Production fulfillment runtime composition

**Files:**
- Modify: `functions/src/commerce/fulfillment-runtime.js`
- Modify: `functions/test/commerce/fulfillment-runtime.test.js`

**Interfaces:**
- Consumes: `createFulfillmentRepository({db,fieldValue,Timestamp})`, `createPrivateArtifactStreamer({bucket})`, `createFulfillmentService(...)`, and the verified catalog artifact definition.
- Produces: `createFulfillmentRuntime({db,fieldValue,Timestamp,bucket})` returning the existing fulfillment service and `readFulfillmentRuntimeReadiness()` reporting one verified active artifact.

- [ ] **Step 1: Write failing composition tests**

Assert that the runtime factory rejects the wrong bucket or missing dependencies, accepts only bucket `the-ballers-kingdom.firebasestorage.app`, and passes the frozen artifact allowlist containing generation `1788191152627469` into the fulfillment service. Assert readiness becomes:

```js
{
  ready:true,
  verifiedBucket:'the-ballers-kingdom.firebasestorage.app',
  activeArtifactCount:1,
  blocker:null,
}
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd functions
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test test/commerce/fulfillment-runtime.test.js
```

Expected: fail because the current runtime always throws `FULFILLMENT_RUNTIME_NOT_READY`.

- [ ] **Step 3: Implement dependency composition**

Compose the existing repository, streamer, and service without adding a second authorization or storage implementation. Freeze the artifact map and readiness response. Keep every object path and checksum server-only.

- [ ] **Step 4: Run fulfillment tests**

Run `fulfillment-runtime`, `fulfillment`, `fulfillment-repository`, and `private-artifact-stream` tests. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add functions/src/commerce/fulfillment-runtime.js functions/test/commerce/fulfillment-runtime.test.js
git commit -m "feat: compose protected fulfillment runtime"
git push
```

---

### Task 3: Authenticated grant and streaming Functions

**Files:**
- Create: `functions/src/commerce/download-http.js`
- Create: `functions/test/commerce/download-http.test.js`
- Modify: `functions/src/index.js`
- Create: `functions/test/commerce/download-function-contract.test.js`

**Interfaces:**
- Consumes: `createFulfillmentRuntime(...)`, Firebase Admin `getAuth().verifyIdToken(token, true)`, `getAuth().getUser(uid)`, and `getAppCheck().verifyToken(token,{consume:true})`.
- Produces: callable `createDownloadGrant` and HTTPS `redeemDownloadGrant`.

- [ ] **Step 1: Write failing transport tests**

Test an injected `createDownloadHttpHandler()` rather than calling production Firebase. Cover OPTIONS and POST, exact origin allowlist, headers, JSON size/type, Bearer parsing, revoked/disabled users, App Check consumption and `alreadyConsumed`, generic 401/403/404 responses, and success headers. Assert provider errors and tokens never enter response bodies.

The success test must assert:

```js
assert.equal(response.headers['content-type'],'application/pdf');
assert.equal(response.headers['content-disposition'],
  'attachment; filename="Home Inspection Study Guide.pdf"');
assert.equal(response.headers['cache-control'],'private, no-store, max-age=0');
assert.equal(response.headers['x-content-type-options'],'nosniff');
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd functions
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --test test/commerce/download-http.test.js
```

Expected: fail because the transport module does not exist.

- [ ] **Step 3: Implement the isolated HTTP adapter**

Implement exact-origin CORS, 16 KiB request-body limit, strict JSON object keys `orderHandle` and `grant`, ID-token verification with revocation checking, authoritative user readback requiring enabled and email-verified state, and consumed limited-use App Check verification. Pass only normalized UID/App Check context and the response stream to the fulfillment service. Set safe headers before calling the existing streamer only after authorization and grant validation complete.

- [ ] **Step 4: Export both Functions**

In `functions/src/index.js`, initialize Admin Storage/App Check imports, create the verified bucket/runtime lazily, export:

```js
export const createDownloadGrant = onCall({
  region:REGION,
  enforceAppCheck:true,
}, async request => fulfillmentRuntime().createDownloadGrant(
  {orderId:String(request.data?.orderHandle ?? '')},
  {auth:request.auth,app:request.app},
));

export const redeemDownloadGrant = onRequest({region:REGION}, downloadHttpHandler());
```

Map errors to generic Firebase/HTTP responses and expose no private configuration.

- [ ] **Step 5: Update credential/deploy contract tests**

Assert neither endpoint binds QuickBooks, Microsoft, or recipient secrets, and both are included in the scoped deployment inventory while `confirmAcceptedBooking` remains excluded.

- [ ] **Step 6: Run focused and full Functions tests**

Run download, fulfillment, credential, syntax, then the complete Functions test suite. Expected: zero failures; only documented emulator-only skips are permitted.

- [ ] **Step 7: Commit**

```bash
git add functions/src/commerce/download-http.js functions/test/commerce/download-http.test.js functions/test/commerce/download-function-contract.test.js functions/src/index.js
git commit -m "feat: add protected download endpoints"
git push
```

---

### Task 4: Browser PDF redemption and cleanup

**Files:**
- Modify: `assets/js/commerce-client.js`
- Modify: `tests/commerce-browser.spec.mjs`
- Modify: `tests/storefront-html.test.mjs`

**Interfaces:**
- Consumes: browser runtime token methods and Functions `createDownloadGrant` / `redeemDownloadGrant`.
- Produces: one in-memory grant redemption and a temporary download named `Home Inspection Study Guide.pdf`.

- [ ] **Step 1: Write failing browser tests**

Extend Playwright coverage to prove the real boundary:

- calls the grant callable with ID and ordinary App Check tokens;
- calls the stream endpoint with a fresh ID token and limited-use App Check token;
- accepts only HTTP 200 plus `application/pdf`;
- creates one object URL, triggers the exact filename, revokes the URL, and clears the grant;
- never puts tokens/grants/private paths in history, local storage, session storage, DOM, or console;
- does not retry redemption after an ambiguous/failed stream;
- permits a user-initiated fresh grant request after failure.

- [ ] **Step 2: Run browser tests and verify RED**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx playwright test tests/commerce-browser.spec.mjs
```

Expected: fail because the real boundary still throws `Protected delivery runtime is not released`.

- [ ] **Step 3: Implement grant callable and PDF fetch helpers**

Use `realCallable('createDownloadGrant',...,{auth:true})`. For redemption, request fresh ID and limited-use App Check tokens, POST strict JSON to `redeemDownloadGrant`, validate status/content type/body bounds, create a Blob/object URL, click a detached `<a download="Home Inspection Study Guide.pdf">`, then revoke and clear everything in `finally`. Never set `credentials:'include'`.

- [ ] **Step 4: Run browser and content tests**

Run the commerce browser spec and storefront unit tests. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add assets/js/commerce-client.js tests/commerce-browser.spec.mjs tests/storefront-html.test.mjs
git commit -m "feat: deliver protected guide in browser"
git push
```

---

### Task 5: Emulator, security, and release evidence

**Files:**
- Modify: `firebase.json` only if the emulator/function inventory requires the two new endpoints.
- Modify: `docs/operations/home-inspection-commerce-pilot-evidence.md`
- Create: `docs/operations/protected-commerce-delivery-verification.md`

**Interfaces:**
- Consumes: complete branch implementation and existing Firestore/Storage Rules.
- Produces: reviewable non-secret verification evidence and a scoped release manifest.

- [ ] **Step 1: Run the complete local gate**

Run Node 22 storefront unit/browser tests, all Functions tests, syntax checks, Firestore/Storage emulator matrix, `npm audit --omit=dev`, Functions audit, `git diff --check`, and the secure repository checker. Classify only known synthetic fixture findings; do not waive high/critical issues.

- [ ] **Step 2: Verify packaging and false flags**

Confirm Hosting excludes private artifacts, Functions source, tests, rules, docs, and local configs. Read back `functions/.env.the-ballers-kingdom` and require both commerce flags to be exactly false. Ensure no `.secret.local`, debug log, token, grant, action code, or private object URL is tracked.

- [ ] **Step 3: Record evidence**

Document test counts, exact commit, safe public config provenance without recording config values, emulator outcomes, private-object metadata comparison, no-send/no-accounting-mutation statement, known dependency advisory disposition, rollback commands, and remaining accountant/activation gates.

- [ ] **Step 4: Commit and push evidence**

```bash
git add firebase.json docs/operations/home-inspection-commerce-pilot-evidence.md docs/operations/protected-commerce-delivery-verification.md
git commit -m "docs: verify protected commerce delivery"
git push
```

- [ ] **Step 5: Request whole-branch review and open PR**

Review the frozen branch diff, run the repository’s PR path, and open a PR against current `main`. Do not add commits while review is in flight; address findings test-first and repeat review if code changes.

---

### Task 6: Scoped production release and independent smoke verification

**Files:**
- No new source files unless a verified release defect requires a test-first correction.
- Update: `docs/operations/protected-commerce-delivery-verification.md` after successful independent readback.

**Interfaces:**
- Consumes: merged PR commit and explicit deployment authorization already granted for this protected-delivery implementation.
- Produces: deployed inactive runtime with independently verified denial and private-stream controls.

- [ ] **Step 1: Merge and create a clean detached release worktree**

Fetch `origin/main`, verify the PR merge commit, create a clean detached worktree from that exact commit, install locked dependencies inside both roots, and rerun focused release tests.

- [ ] **Step 2: Deploy only required Functions and Hosting**

Extend the existing explicit 18-function allowlist with `createDownloadGrant` and `redeemDownloadGrant`; continue excluding `confirmAcceptedBooking`. Deploy Hosting target `public` only if the merged browser runtime files changed. Always pass explicit project and account flags.

- [ ] **Step 3: Independently verify production state**

Read back both new Function states/runtime/update times, both false feature flags, Hosting assets and cache headers, exact object metadata, unauthenticated denial, wrong-origin denial, and direct Storage denial. Use a synthetic or emulator fulfilled order for stream proof unless a separately approved real owner order already exists; do not create an invoice or send an email as a smoke test.

- [ ] **Step 4: Preserve fail-closed catalog state**

Keep `active:false`, `accountantVerified:false`, and `deployApproved:false`. Record that runtime deployment is complete but purchase activation remains blocked by professional tax confirmation and the separately approved live pilot sequence.

- [ ] **Step 5: Update durable memory**

Use `ecoai remember` with a non-secret milestone containing the merge commit, scoped deploy result, verification outcome, zero sends/provider mutations, and remaining gates.

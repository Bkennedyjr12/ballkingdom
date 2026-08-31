# Task 4 Report — Browser PDF redemption and cleanup

## Result

Implemented the production browser boundary for one-time protected PDF delivery. The client now creates an authenticated download grant through the callable endpoint, redeems it with a fresh Firebase ID token and limited-use App Check token, validates and bounds the PDF response, triggers the exact filename from a temporary object URL, and revokes that URL.

## Files

- `assets/js/commerce-client.js`
- `tests/commerce-browser.spec.mjs`
- `tests/storefront-html.test.mjs`

## TDD evidence

- RED: the two initial real-boundary browser cases timed out waiting for the download button because the production boundary still threw `Protected delivery runtime is not released`; 13 existing cases passed.
- GREEN: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx playwright test tests/commerce-browser.spec.mjs` — 17 passed.
- GREEN: `npm run test:storefront:unit` — 21 passed.
- GREEN: `git diff --check` — clean.

## Security and behavior evidence

- Grant callable uses ordinary App Check plus a Firebase ID token.
- Stream request obtains a fresh ID token and limited-use App Check token and uses `credentials:'omit'`.
- Only HTTP 200 with exact `application/pdf` is accepted.
- Declared and streamed bodies are bounded to 80 MiB; empty, malformed, mismatched, and oversized bodies fail closed.
- The detached link downloads as `Home Inspection Study Guide.pdf`; its temporary object URL is revoked after the click is dispatched.
- Browser coverage verifies no raw grant, test token, or private path reaches URL/history-visible state, local storage, session storage, DOM, or console.
- A failed or ambiguous stream is not automatically retried. A later user click requests a fresh grant.
- No message, payment, invoice, provider, environment-flag, catalog, tax, or release-setting mutation was made.

## Deviations

None. The implementation remains within Task 4 scope.

## Review round 1/5

Addressed all three review findings:

- Added one 30-second `AbortController` deadline spanning the stream fetch and all body reads. A stalled reader is cancelled, the UI returns to the generic safe failure state, and no automatic retry occurs.
- Added browser regressions for a never-resolving fetch, partial-reader stall, empty body, zero and malformed `Content-Length`, declared/streamed mismatch, an unbounded stream exceeding 80 MiB, and a reader error after partial bytes. Every case proves the button re-enables with no object URL, download, or false success.
- Tightened grant validation to exactly `grant` and `expiresAt`, a 43-character base64url grant, and a canonical future ISO expiration before limited-use App Check or stream-token work begins.

Review-fix verification:

- `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx playwright test tests/commerce-browser.spec.mjs` — 26 passed.

## Review round 2/5

Removed every awaited `ReadableStreamDefaultReader.cancel()` path. Cancellation is now best-effort and attaches a rejection handler without allowing a stalled cancellation promise to extend the download deadline or produce an unhandled rejection. Added an adversarial stream whose underlying `cancel()` returns a never-resolving promise; the browser still shows only the generic failure, re-enables the button, performs no retry, and creates no object URL or download.

- Browser verification: 27 passed.
- Storefront unit/content verification: 21 passed.
- `git diff --check`: clean.

## Whole-branch review round 2

Separated existing-order session establishment from new-order creation while retaining in-memory Firebase Auth:

- A valid `?order=` context now exposes a clear **Sign in and resume order** action, hides the irrelevant customer-name input, and explains that resuming cannot create or send another invoice.
- Returning buyers can request/use an email link, complete authentication, and re-poll the same opaque order handle after reload or late fulfillment.
- Existing-order recovery remains available while new sales are inactive; the server still independently enforces ownership and fulfillment.
- The resume branch never calls `createDigitalOrder`, avoiding duplicate order/invoice risk. The original new-order behavior and fail-closed controls remain unchanged.

TDD evidence:

- RED: the returning-buyer test could not find a resume action before implementation.
- GREEN: commerce browser suite — 28 passed.
- GREEN: storefront unit/content suite — 21 passed.
- GREEN: `git diff --check` — clean.

## Returning-buyer round 2/5

Closed the production email-link continuation seam:

- The browser includes `orderHandle` only when requesting a sign-in link from a validated existing-order context; new-order requests retain the original email-only schema.
- The server accepts only exact `email` / optional `orderHandle` keys, applies the existing bounded safe-ID format, re-reads the order, and requires the approved-recipient binding, digital-product type, expected SKU, and an assigned customer before building a resume URL.
- The server-owned URL builder fixes the HTTPS origin/path and emits both `sku` and the authorized `order` handle. Missing, malformed, foreign, or extra-field requests return the same generic result and perform no persistence or sender call.
- An authorized resume uses an order-scoped, one-way effect binding, so a previously completed new-order sign-in effect cannot suppress the returning buyer's resume link; parallel requests for the same order remain deduplicated.
- Browser integration coverage obtains the order handle from the actual request, derives the return location with the production server URL builder, completes the in-memory Auth return, and proves `createDigitalOrder` remains uncalled.

TDD and verification evidence:

- RED: the service test first failed because the secure server URL builder did not exist, then proved a completed base sign-in effect incorrectly suppressed the resume continuation until the order-scoped effect binding was added.
- Commerce service tests: 46 passed.
- Complete Functions suite: 403 passed, 2 documented emulator-only skips, 0 failed.
- Functions syntax/check gate: passed.
- Commerce browser suite: 28 passed.
- Storefront unit/content suite: 21 passed.
- `git diff --check`: clean.
- No real authentication email, invoice, payment, deployment, provider mutation, or activation occurred.

## Returning-buyer round 3/5

Implemented the two controller-approved corrections while leaving the accepted timing residual unchanged:

- Completed resume-link effects can be atomically reissued up to five total deliveries. Each reissue resets only the completed dispatch state, increments a durable issuance counter, and records a redacted `effect_reissued` receipt.
- Concurrent reissue requests serialize through the Firestore transaction: exactly one transitions `completed` back to `pending`, and exactly one claimant crosses the dispatch boundary. Pending, claimed, manual-review, and capped effects cannot be reset.
- Ambiguous sends remain permanently quarantined in `manual_review`; a later request cannot retry them.
- Missing/foreign orders plus wrong SKU, order type, customer assignment, unsafe handle, oversize handle, and expanded schemas all return the same generic response without Admin-link generation, persistence, or Graph delivery.
- The returning-buyer browser integration now invokes the production commerce service, captures the exact link passed to the mocked `graph.sendPilotAuthLink`, uses a Firebase-shaped Admin Auth stub whose `continueUrl` is the actual `actionCodeSettings.url`, extracts that exact continuation, and completes the existing-order browser flow without calling `createDigitalOrder`.
- Per controller ruling, no artificial timing envelope was added around uncancellable Firebase Admin Auth work. The residual is accepted given the random opaque handle, generic response, approved-recipient binding, and App Check boundary.

TDD and verification evidence:

- RED: completed-effect reissue tests observed one delivery instead of five; parallel reissue tests observed one total delivery instead of two; repository transitions returned `false` for the first valid reissue.
- GREEN: complete Functions suite — 409 passed, 2 documented emulator-only skips, 0 failed (411 total).
- Functions syntax/check gate: passed.
- Commerce browser suite: 28 passed, including the exact mocked Graph-link continuation.
- Storefront unit/content suite: 21 passed.
- `git diff --check`: clean.
- Secure repository scan completed; reported only known synthetic/test patterns and the existing public Firebase web configuration, with no new secret material.
- No real authentication email, invoice, payment, deployment, provider mutation, feature-flag activation, or catalog/tax mutation occurred.

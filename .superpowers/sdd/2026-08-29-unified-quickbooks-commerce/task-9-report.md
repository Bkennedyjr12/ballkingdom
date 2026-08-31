# Task 9 implementation report

## Compact design plan

- **Tokens:** Reuse the site’s near-black `#050505`/`#111` surfaces, warm gold accent, stone paper surface, and existing spacing/button tokens. Status states use text, borders, and icons together; color never carries meaning alone.
- **Type:** Keep Oswald for decisive headings/actions and Inter for transactional copy. The order reference and progress labels use restrained display-type tracking rather than introducing a dashboard font.
- **Layout:** A single narrow transaction rail moves from identity to invoice instruction to server verification to delivery. On desktop, the order summary and current action sit in an asymmetric 5/7 split; at 390px they collapse into one reading order with full-width controls.
- **Signature:** A gold “verification line” and four numbered ledger stops connect the commerce experience to Ballers Kingdom’s existing delivery-ledger motif. The central metaphor is a protected handoff, not a generic checkout card.
- **Motion/accessibility:** Only a subtle current-step emphasis when reduced motion is not requested. Visible focus, live status announcements, explicit labels, and keyboard-first ordering are mandatory.

## Generic-choice critique

Avoid a centered SaaS checkout modal, gradient payment buttons, generic green success banners, provider logos as trust decoration, or a fake multi-step progress bar. Those patterns would imply an embedded processor and overstate immediacy. The experience should instead feel like a Ballers Kingdom operating ledger: sober, source-aware, and explicit about which system acts next.

## Implementation notes

- Added a shared order-status page with separate identity and invoice actions, a server-priced summary, normalized status announcements, fulfillment terms, and protected-delivery controls.
- The browser exposes no QuickBooks/Intuit pay URL and collects no payment credentials. URL query assertions never establish order state.
- Commerce now targets the real regional callable names through a narrow Firebase runtime boundary that supplies Firebase ID and App Check tokens. The reviewed browser tests inject that boundary; the production runtime/bootstrap remains deliberately absent while Task 7 Rules and fulfillment are parked. Without it, both product and order actions fail closed.
- Product activation requires the exact matching server SKU with `active:true`; otherwise no buyer navigation occurs.
- Status accepts only the public four-field allowlist and seven normalized states. Unknown fields, accounting identifiers, provider URLs, or malformed values fail closed.
- Polling is bounded to 12 attempts and stops on terminal state. The test boundary uses one immediate read without changing the production bound.
- A download nonce exists only in a function-local variable, is passed to one redemption call, then cleared. It is never put in a URL, log, analytics event, or browser storage; a failed redemption returns to a safe view from which the owner may request a new grant.
- Visual review passed at 1440×1000 and 390×844. The asymmetric ledger becomes one column on mobile, focus is clearly visible, and reduced-motion users receive no commerce animation.

## Verification

- Task 9 browser suite: 13 tests.
- Existing storefront suite: 18 unit/content tests and 4 existing browser flows.
- Full Functions suite: 295 passed with 2 explicit environment-gated Rules/Storage emulator skips.
- Functions syntax check and `git diff --check`: passed.
- Secure repository scan: completed. It reported only pre-existing synthetic token-like strings in Functions test fixtures; no Task 9 production credential or secret material was added.
- Root production dependency audit: 0 vulnerabilities. Functions audit retains the pre-existing `uuid` transitive advisory (7 moderate paths) whose offered automatic fix is a breaking Firebase Admin downgrade; Task 9 added no dependency and did not force an unrelated breaking change.

## Boundaries

- No live API, Auth, App Check, QuickBooks, Graph, email, payment, invoice, grant, deploy, push, or Firebase operation was performed.
- Purchases remain inactive. Authoritative Firestore/Storage Rules recovery, emulator proof, production adapter review, and release approval remain blockers.

## Review fix round 1

- Added a separate App Check-enforced `getBuyerCommerceCapability` callable. It returns only `{products:[{sku,active}]}` and does not alter the administrator-only release-state endpoint. An item can become active only when the server catalog, digital flag, and protected-fulfillment activation all agree; fulfillment activation remains false.
- Reconciled the real owner-authorized status endpoint to the exact browser allowlist: `{orderHandle,status,message,downloadReady}`. Amounts, currency, email, accounting identifiers, provider fields, and URLs are absent.
- Added safe mappings for invoice-send pending, payment verification, paid, fulfillment delay, fulfillment, cancellation/refund, and manual support.
- Moved the email action return to the exact gated product route. Direct order routes require the exact active SKU before identity or invoice actions enable.
- Existing owner status remains readable through an authenticated handle even if new sales pause; the handle never authorizes the read.
- Added coverage for identical allowed/mismatched/duplicate auth-request rendering, invalid/replayed email links, signed-out/wrong-owner denial, strict capability/status contracts, exact-SKU gating, terminal/timeout polling bounds, reduced motion, and safe grant replay/retry.
- Full Functions verification after reconciliation: 295 passed with the same 2 explicit Rules/Storage environment skips.

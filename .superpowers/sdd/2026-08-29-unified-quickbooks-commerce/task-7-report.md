# Task 7 — Protected digital fulfillment

## Result

Implemented local, dependency-injected protected fulfillment with no production Storage assumptions:

- 256-bit random download nonce; only its SHA-256 digest is passed to persistence.
- Ten-minute validity with expiration at the exact boundary.
- App Check plus authenticated immutable order-owner enforcement.
- Fulfilled-order and active-entitlement enforcement; invoice, webhook, unpaid, and merely paid states cannot download.
- Server-only SKU-to-object allowlist; browser UIDs and storage paths are ignored or rejected.
- Atomic one-use redemption contract; concurrent/replayed grants fail.
- A streaming failure leaves the token consumed, while the authenticated owner may create a new token without another payment.
- Path traversal and malformed order/grant values fail closed.

The implementation is intentionally not wired to a production Storage bucket in `functions/src/index.js` and does not replace Task 6's atomic verified-payment entitlement creation. The missing verified bucket/object placement and authoritative Rules policy make such wiring unsafe. `fulfillPaidOrder()` remains available for a later reviewed orchestration boundary, while Task 6's transaction stays the active local entitlement source.

## Rules boundary

- Added an unmapped, deny-only local `storage.rules` fragment for static verification.
- Preserved the existing unmapped Firestore deny fragment.
- Added both Rules filenames to every Hosting ignore list.
- Did not add `firestore.rules` or `storage.rules` deployment mappings.
- Did not guess a bucket, object prefix, or production policy.
- Recorded the exact missing evidence and local-only hashes in `docs/operations/firebase-commerce-rules-source-evidence.md`.

## Verification

- `npm --prefix functions test -- test/commerce/fulfillment.test.js`: 8 passed.
- `npm --prefix functions test -- test/commerce/firestore-rules.test.js test/commerce/storage-rules.test.js`: 6 passed, 2 explicit environment skips.
- `npm --prefix functions test`: 274 passed, 2 explicit environment skips.
- `npm --prefix functions run check`: passed.
- `node --check functions/src/commerce/fulfillment.js`: passed.
- `git diff --check`: passed.

No emulator claim is made: `/usr/bin/java` exists only as a launcher and reports that no Java Runtime is installed; `@firebase/rules-unit-testing` is also absent.

## Release blockers

The production pilot and all Rules activation remain blocked until the authoritative production Firestore and Storage Rules sources, exact bucket mapping, paid-object placement, source/merged hashes, Java runtime, Rules test SDK, and emulator proof are recovered and reviewed. No deploy, provider call, secret access, message, invoice, payment, or refund occurred in this task.

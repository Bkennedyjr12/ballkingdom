# Task 7 — Protected digital fulfillment

## Result

Implemented local, dependency-injected protected fulfillment with no production Storage assumptions:

- 256-bit random download nonce; only its SHA-256 digest is passed to persistence.
- Ten-minute validity with expiration at the exact boundary.
- App Check plus authenticated immutable order-owner enforcement.
- Fulfilled-order and active-entitlement enforcement; invoice, webhook, unpaid, and merely paid states cannot download.
- Server-only SKU-to-object allowlist; browser UIDs and storage paths are ignored or rejected.
- Required atomic one-use redemption repository contract; concurrent/replayed grants fail against the in-memory contract test. This is not evidence of a real Firestore transaction or persistent emulator behavior.
- A streaming failure leaves the token consumed, while the authenticated owner may create a new token without another payment.
- Path traversal and malformed order/grant values fail closed.

The implementation is intentionally not wired to a production Storage bucket in `functions/src/index.js` and does not replace Task 6's atomic verified-payment entitlement creation. The missing verified bucket/object placement and authoritative Rules policy make such wiring unsafe. `fulfillPaidOrder()` remains available for a later reviewed orchestration boundary, while Task 6's transaction stays the active local entitlement source.

## Fix round 1

- Identity now derives exclusively from `authContext.auth.uid`; a top-level `uid` is never trusted. Regression coverage proves that top-level owner spoofing cannot override a nested attacker UID and that a top-level UID without nested Firebase auth is rejected.
- Renamed the object boundary to `streamArtifact` and enforced a stream-only result contract. Results containing `url`, `providerUrl`, `signedUrl`, or any other URL-shaped key are rejected; `streamed:true` is required.
- The stream boundary returns only bounded streaming metadata (`streamed`, optional `contentType`, optional `bytesWritten`); returned bodies or any unrecognized key are rejected.
- Clarified across this report and the Rules evidence that redemption atomicity is a required repository contract demonstrated by a mock. No real Firestore transaction, persistence implementation, or emulator proof is claimed.
- The intentionally unwired runtime, bucket, and Rules boundary remains unchanged.

## Fix round 2

- Each server-owned SKU artifact definition now supplies the private object key, exact expected MIME type, and maximum byte count.
- Stream receipts must report that exact MIME type and a nonnegative safe-integer `bytesWritten` no larger than the per-SKU ceiling.
- Malformed, parameterized, oversized, control-character, or wrong MIME values fail closed. Excessive byte counts, unknown receipt keys, URL-shaped fields, and body returns also fail closed.
- The exact maximum-byte boundary is accepted. This remains a local stream-contract test; production object metadata, bucket mapping, and persistent streaming are still unwired and blocked.

## Rules boundary

- Added an unmapped, deny-only local `storage.rules` fragment for static verification.
- Preserved the existing unmapped Firestore deny fragment.
- Added both Rules filenames to every Hosting ignore list.
- Did not add `firestore.rules` or `storage.rules` deployment mappings.
- Did not guess a bucket, object prefix, or production policy.
- Recorded the exact missing evidence and local-only hashes in `docs/operations/firebase-commerce-rules-source-evidence.md`.

## Verification

- `npm --prefix functions test -- test/commerce/fulfillment.test.js`: 11 passed after fix round 2.
- `npm --prefix functions test -- test/commerce/firestore-rules.test.js test/commerce/storage-rules.test.js`: 6 passed, 2 explicit environment skips.
- `npm --prefix functions test`: 274 passed, 2 explicit environment skips.
- `npm --prefix functions run check`: passed.
- `node --check functions/src/commerce/fulfillment.js`: passed.
- `git diff --check`: passed.
- Fix-round full suite: 276 passed, 2 explicit environment skips.
- Secure repository checker completed; its secret-like findings are unchanged synthetic values in pre-existing provider/commerce tests, with no Task 7 file reported.

No emulator claim is made: `/usr/bin/java` exists only as a launcher and reports that no Java Runtime is installed; `@firebase/rules-unit-testing` is also absent.

## Release blockers

The authoritative deployed Rules originals and exact bucket are now independently retained. The production pilot and Rules activation remain blocked until the local merge candidates are independently accepted, the paid artifact and exact private object key are approved and present, Java and the Rules SDK are separately approved/installed, the complete emulator matrix passes, and explicit mappings receive release review. No deploy, dry run, provider call, secret access, object upload/content read, message, invoice, payment, or refund occurred in this task.

## Resumed implementation from evidence commit `86a1d82`

- Created separate Firestore and Storage merge candidates from the immutable retained deployed originals. Removing the one marked commerce block from either candidate yields the original byte-for-byte. Stable diffs, source/candidate/diff hashes, provenance, and inactive release flags are recorded in the candidate manifest.
- Added explicit direct-client denies for every server-authoritative commerce collection and `private-commerce/{artifact=**}` without changing root Rules fragments or `firebase.json` mappings.
- Implemented a Firestore transactional fulfillment repository. It persists only grant digests and bounded binding fields, verifies the fulfilled order plus active entitlement in the same transaction, enforces an exact ten-minute grant, atomically consumes once, rejects replay/expiry, and allows a new digest after a stream failure.
- Added a serialized Firestore-shaped fake that exercises real repository transaction code. This is faithful local transaction-contract evidence, not emulator or live persistence evidence.
- Implemented a private Admin Storage stream adapter pinned to `the-ballers-kingdom.firebasestorage.app`. It verifies the private prefix and exact object metadata, streams directly to the response, and never calls or returns a signed URL.
- Added a fail-closed runtime readiness module: `ready:false`, `activeArtifactCount:0`, blocker `paid_artifact_absent`. No endpoint or active SKU object is wired because the verified inventory contains no paid artifact.
- Did not add the Rules SDK because Java is absent and no emulator claim can be made; no Java or tooling installation was attempted.

### Resumed verification

- Functions: 332 passed, 2 explicit release-gate skips.
- Storefront: 18 unit/content and 4 browser tests passed.
- Home Inspection companion-link verification passed.
- Functions static checks and direct syntax checks for all four fulfillment modules passed.
- Original and candidate Rules hashes matched the recorded provenance and candidate manifest.
- Secure repository scan reported only the existing synthetic secret-like strings in pre-existing tests; no Task 7 file was flagged.
- Production dependency audit reports 7 moderate transitive `uuid` findings under the existing Firebase/Google Storage dependency chain. The offered forced remediation would downgrade `firebase-admin` to a breaking major version, so no unrelated forced dependency mutation was made.

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

## Resumed fix round 1

- Private streaming now requires a valid numeric object generation from metadata and reselects the file with `{generation}` before `createReadStream({validation:'crc32c'})`. The unpinned file is never read, so replacement between metadata validation and streaming cannot substitute a newer object.
- Stream receipts count actual chunks. The adapter destroys/unpipes the source and destroys the response if actual bytes exceed the SKU ceiling or validated metadata length; truncated streams also fail because actual bytes must equal the validated content length.
- Response `close`, `aborted`, or error before `finish` rejects exactly once. Every success/failure path removes source and response listeners; disconnect tests prove the promise settles and the source is destroyed.
- The download grant remains consumed before streaming. Existing service/repository tests prove any stream/disconnect failure cannot reopen or replay that grant, while a new authenticated digest can be issued without another payment.
- Customer identity validation now uses a dedicated Firebase UID rule rather than the order/document-ID regex: 1–128 characters, including legitimate custom UID punctuation, with control characters and oversized values rejected consistently by the service and Firestore repository.
- Focused stream/repository/service suite: 23 passed.
- Complete tracked Functions suite: 337 passed, 2 explicit release-gate skips.
- Static syntax, diff, immutable-original hashes, and candidate-manifest hashes passed unchanged.
- Secure repository scan again reported only synthetic strings in pre-existing tests; no Task 7 file was flagged.
- Bare `node --test` also discovered an unrelated untracked stale duplicate named `private-artifact-stream.test 2.js`. It uses the pre-fix contract and failed as expected; it and the unrelated `firestore 2.diff` were preserved untouched and excluded by running the complete Git-tracked test manifest explicitly.

## Rules emulator verification

- Installed approval supplied Java 21 from `/opt/homebrew/opt/openjdk@21` and the test-only dependencies `@firebase/rules-unit-testing@5.0.2` and `firebase@12.18.0`.
- Loaded the two separate reviewed merge candidates directly into isolated emulators under demo project `demo-ballkingdom-commerce`; the repository-root fragments and `firebase.json` remained unmapped and unchanged.
- Firestore emulator coverage proves signed-out, ordinary authenticated, correct-owner, wrong-owner, and admin client contexts cannot read, list, or write any server-authoritative commerce collection. It also proves the retained correct-owner client-profile read remains allowed while other identities and all client writes remain denied.
- Storage emulator coverage proves the same five identity contexts cannot read, list, write, or delete under `private-commerce/**`. It also proves the retained correct-owner inspection-media read/PDF-upload behavior remains allowed while signed-out, ordinary, wrong-owner, and admin contexts remain denied.
- Emulator result: 10 passed, 0 failed, 0 skipped using Auth, Firestore, and Storage emulators. Each test clears isolated emulator data before and after execution; the demo project prevents production fallback.
- Complete Git-tracked Functions suite outside the emulators: 337 passed, 0 failed, and the two emulator-only tests skipped conditionally as designed.
- Functions static checks, `git diff --check`, and the secure repository checker passed. The checker reported only the existing synthetic secret-like strings in pre-existing tests; no Task 7 file was flagged.
- Both the production-only and complete dependency audits still report the same seven moderate transitive `uuid` findings through the existing Firebase Admin/Google Storage dependency chain. The offered forced remediation is a breaking `firebase-admin` downgrade and was not applied.
- Candidate hashes remained unchanged: Firestore `78138d8cd5ffd417c932c670bc2327c33886a43c4c880c7de6a3ba33d056f122`; Storage `5d5bc0155f2f2c2a39b0b837714903e4337a0868ec0997375ad4e14d36e03de8`.

This emulator proof removes the former Java/SDK authorization-test blocker only. It does not activate Rules, map a production ruleset, establish live persistence, place a paid artifact, or make fulfillment runtime-ready.

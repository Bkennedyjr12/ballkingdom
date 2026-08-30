# QuickBooks rotating-credential local evidence

Status: **LOCAL ONLY — not reviewed, deployed, or production-tested**

Date: 2026-08-30 (America/Los_Angeles)

## Incident addressed

An approved read-only health check obtained an Intuit access credential and a rotated refresh credential. The check intentionally retained no payload, so the replacement was not persisted; the prior Secret Manager value subsequently returned `invalid_grant`. The approved OAuth reconnect restored a current secret version. This change addresses the runtime design defect without reading any production secret or calling QuickBooks.

## Implemented safety boundary

- Every refresh selects the highest numeric enabled `QBO_REFRESH_TOKEN` version at runtime; disabled and destroyed versions are skipped.
- A Firestore one-attempt claim serializes refresh use for at most five minutes. Only a never-started expired claim is recoverable.
- Immediately before Intuit, the exact owner atomically records `dispatchStartedAtMs` and `attemptCount:1`. A started claim is never automatically reclaimed after timeout, expiry, crash, or clock skew.
- The Intuit replacement refresh credential is validated, added as a Secret Manager version, and read back exactly before an access credential can reach the Accounting adapter.
- A same-runtime concurrent request shares the pending operation. Other runtimes cannot refresh in parallel under an active lease.
- `invalid_grant` and unknown post-dispatch outcomes become durable `qbo_reconnect_required`; timeout becomes `qbo_refresh_timeout`; unresolved version-add ambiguity becomes `qbo_refresh_persistence_unknown`. All fail closed before Accounting.
- Firestore receipts contain version metadata only; no access credential, refresh credential, provider body, or authorization header is persisted or returned.
- OAuth callback storage for the initial/reconnected credential remains and explicitly resets the manual-review control only after both credential and realm versions are added.
- Intuit and all Secret Manager calls have bounded deadlines well below the claim duration. `QBO_REFRESH_TOKEN` is removed from every Firebase secret declaration/binding and is accessed only through explicit secret-scoped runtime IAM.

## Local proof

The focused suite covers persistence-before-request ordering, same-runtime concurrency, active and stale leases, redacted `invalid_grant`, definite persistence failure, ambiguous add with exact latest-version readback, absence of credential material in lease receipts/errors, Secret Manager exact-version behavior, and no Accounting request after credential failure.

- Node 22 full Functions suite: 364 tests total; 362 passed and 2 emulator-only tests intentionally skipped.
- Functions syntax checks plus the new coordinator module syntax check: passed.
- `git diff --check`: passed.
- Repository security scan: no production credential identified; reported locations are synthetic test fixtures.
- Production dependency audit: 7 moderate transitive `uuid` findings through the existing Firebase/Google dependency chain, with no high or critical finding. npm's offered resolution is a breaking Firebase Admin downgrade and was not forced into this scoped fix.

No production Secret Manager read/write, Firestore write, QuickBooks request, Firebase deploy/dry run, Git push, invoice, email, payment, or refund occurred during this implementation.

## Remaining release gates

1. Independent code/security review of the exact commit.
2. Confirm secret-scoped runtime IAM for `secretmanager.versions.access` and `secretmanager.versions.add`; do not grant project-wide administration.
3. Confirm the deployed Functions identity can read/write only the internal lease document needed by this coordinator.
4. Separately approve and perform the scoped Functions deployment.
5. Separately approve one read-only production refresh plus CompanyInfo verification, retaining no credential values.
6. Keep both commerce feature flags false until all broader commerce release gates pass.

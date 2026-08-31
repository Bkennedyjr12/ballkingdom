# QuickBooks rotating-credential local evidence

Status: **LOCAL ONLY — not reviewed, deployed, or production-tested**

Date: 2026-08-30 (America/Los_Angeles)

## Incident addressed

An approved read-only health check obtained an Intuit access credential and a rotated refresh credential. The check intentionally retained no payload, so the replacement was not persisted; the prior Secret Manager value subsequently returned `invalid_grant`. The approved OAuth reconnect restored a current secret version. This change addresses the runtime design defect without reading any production secret or calling QuickBooks.

## Implemented safety boundary

- Runtime reads only the exact refresh-token and realm versions in the atomically published Firestore binding; later orphan versions are ignored.
- A Firestore one-attempt claim serializes refresh use for at most five minutes. Only a never-started expired claim is recoverable.
- Immediately before Intuit, the exact owner atomically records `dispatchStartedAtMs` and `attemptCount:1`. A started claim is never automatically reclaimed after timeout, expiry, crash, or clock skew.
- The Intuit replacement refresh credential is validated, added as a Secret Manager version, and read back exactly before an access credential can reach the Accounting adapter.
- A same-runtime concurrent request shares the pending operation. Other runtimes cannot refresh in parallel under an active lease.
- `invalid_grant` and unknown post-dispatch outcomes become durable `qbo_reconnect_required`; timeout becomes `qbo_refresh_timeout`; unresolved version-add ambiguity becomes `qbo_refresh_persistence_unknown`. All fail closed before Accounting.
- Firestore receipts contain version metadata only; no access credential, refresh credential, provider body, or authorization header is persisted or returned.
- OAuth reconnect fences the binding generation, stores token and realm independently, exact-readbacks both, and publishes only the verified pair. Partial or ambiguous writes stay orphaned and fail closed in manual review.
- Intuit and all Secret Manager calls have bounded deadlines well below the claim duration. Both `QBO_REFRESH_TOKEN` and `QBO_REALM_ID` are removed from Firebase secret declarations/bindings and are accessed only through explicit secret-scoped runtime IAM.
- An absent binding intentionally requires an approved OAuth reconnect/bootstrap after deployment. Old and orphan version cleanup remains an operator task.

## Local proof

The focused suite covers persistence-before-request ordering, same-runtime concurrency, active/stale claims, redacted `invalid_grant`, exact paired binding reads, generation fencing, old-worker orphan rejection, token-only and realm-only reconnect failures, absence of credential material in receipts/errors, exact-version readback, and no Accounting request after credential failure.

- Node 22 full Functions suite: 384 tests total; 382 passed and 2 emulator-only tests intentionally skipped.
- Functions syntax checks plus the new coordinator module syntax check: passed.
- `git diff --check`: passed.
- Repository security scan: no production credential identified; reported locations are synthetic test fixtures.
- Production dependency audit: 7 moderate transitive `uuid` findings through the existing Firebase/Google dependency chain, with no high or critical finding. npm's offered resolution is a breaking Firebase Admin downgrade and was not forced into this scoped fix.

No production Secret Manager read/write, Firestore write, QuickBooks request, Firebase deploy/dry run, Git push, invoice, email, payment, or refund occurred during this implementation.

## Remaining release gates

1. Independent code/security review of the exact commit.
2. Confirm secret-scoped runtime IAM for `secretmanager.versions.access` and `secretmanager.versions.add` on both QBO secrets; do not grant project-wide administration.
3. Confirm the deployed Functions identity can read/write only the binding, refresh-attempt, and redacted alert documents needed by this coordinator.
4. Separately approve and perform the scoped Functions deployment.
5. Separately approve the OAuth reconnect/bootstrap that publishes the first paired binding.
6. Separately approve one read-only production refresh plus CompanyInfo verification, retaining no credential values.
7. Keep both commerce feature flags false until all broader commerce release gates pass.

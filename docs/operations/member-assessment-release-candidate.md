# Opt-in assessment account release candidate

Status: prepared locally, not deployed or permission-approved. The public
[native assessment](ai-readiness-live-release.md) is already live. This candidate
adds optional saved results to the existing signed-in workout tab, preserving
the current email-link Auth journey, plans, coach grants and Daily Game records.

Brian's retention decision: **save only when the member chooses; retain until
they delete**. Completing or reviewing a questionnaire does not save it. The
member clicks Save this result to my account. Saved results can be reopened,
deletion can be canceled, and confirmed deletion removes the answer record.
The guest assessment remains tab-memory only; its answers are not silently
transferred into another tab's account session.

## Reviewable implementation

- `functions/src/assessment/service.js`: strict versioned consent, server-derived
  owner, recomputed score, deterministic retry ID, list/get/delete and bounded
  errors. No payment, price or entitlement authority.
- `functions/src/assessment/firestore-repository.js`: transactional creation/count,
  deletion and retry receipt in `bkAssessmentAccounts/{verifiedUid}` only.
  Pagination is capped at 20 and account storage at 100 results. A minute window
  permits at most 40 account actions and ten writes. No automatic answer expiry.
- `functions/src/assessment/callable-handler.js`: current authoritative Firebase
  user status, verified email, token revocation time, known App Check app ID and
  exact production origin. Payload identity fields cannot establish ownership.
- `functions-assessment/`: isolated `bk-assessments` codebase exporting only
  `assessmentAccount`. The server feature flag defaults off. It imports no
  existing commerce, mail, provider-secret, workout or companion backend.
- `assets/js/member-assessment-app.js`: existing-tab Auth adapter, explicit save,
  retry, list/reopen, cancel/delete and stale-response suppression after sign-out.
  The portable guest renderer gains an optional mount interface; guest behavior
  remains network/storage/Auth-free.
- `scripts/prepare-member-assessment-release.mjs`: generates nine allowlisted
  candidate public paths into ignored `output/member-assessment-release/public`.
  The three original workout source files must still match their known live
  hashes. They are not edited by preparation. The candidate adds member navigation,
  reuses the existing named Firebase app and adds no new client secret or key.

Auth remains in memory per tab. The component introduces no browser credential
or answer persistence; the existing App Check SDK manages its own attestation
cache. Coaches' workout permissions do not grant assessment access. Direct
browser Firestore access to this namespace remains denied by the current rules.
No Rules update is proposed. Minimal opaque deletion receipts and bounded security
counters retain no answers, scores, emails or source content.

## Exact new permission decision

The original integration instruction explicitly requires approval for “new
persistent grants or permission expansion.” Brian's instruction to make the
site live authorized the public Hosting release; it did not specify these new
backend grants. No grant below has been applied.

Proposed personal project: `the-ballers-kingdom` only.

1. Create a dedicated runtime service account
   `tbk-assessment-account@the-ballers-kingdom.iam.gserviceaccount.com`.
2. Create and bind custom role `tbkAssessmentRuntime` with exactly the seven
   permissions in [the proposed role](assessment-runtime-role.proposed.json):
   Firestore transactions/entity read/list/create/update/delete and
   `firebaseauth.users.get` for current account status. No secret access,
   email-sending, Auth account creation, OAuth or payment permission.
3. Permit browser invocation of only the new `assessmentAccount` Gen 2 callable
   (`roles/run.invoker` for `allUsers` on that function's Cloud Run service).
   Its handler still requires verified Firebase Auth and enforced App Check;
   anonymous callers cannot save/read/delete results.
4. Deploy this isolated endpoint in `us-west1`, max two instances, concurrency 20,
   256 MiB, 30-second timeout and zero minimum instances. Set only
   `BK_ASSESSMENT_ACCOUNT_ENABLED=true` after review; publish the nine-path member
   overlay only after backend verification.

Firestore server IAM applies at database/project scope, not an individual
collection. The reviewed application confines operations to its assessment
namespace; the existing client rules deny direct access. This is why the new
identity and IAM decision must be explicit. Existing workout identity and roles
are not broadened. Its current custom role supports Firestore operations and
sign-in email, but lacks the authoritative user-status read needed here.
New requests may add ordinary usage charges to the existing Firebase project;
there is no new subscription, paid AI provider, OAuth grant or payment account.

References: [Firestore IAM method permissions](https://docs.cloud.google.com/firestore/native/docs/security/iam),
[callable App Check enforcement](https://firebase.google.com/docs/app-check/cloud-functions).

## Verification evidence

Node executable for all reported runs: `/opt/homebrew/opt/node@22/bin/node`.

| Run | Result / ignored evidence |
| --- | --- |
| `node --test functions/test/assessment-service.test.mjs functions/test/assessment-account.test.mjs functions/test/assessment-callable.test.mjs` | 19 passed; `assessment-account-unit-results.txt` |
| `node --test tests/*.test.mjs` | 112 passed; `assessment-account-root-unit-results.txt` |
| `cd functions && node --test` | 547 checks, 544 passed, zero failures, three explicit emulator skips; `assessment-account-functions-results.txt` |
| `FIRESTORE_EMULATOR_HOST=127.0.0.1:8185 BK_ASSESSMENT_RULES_FILE=output/reconciliation/live-firestore-source.rules node --test functions/test/assessment-firestore.test.mjs` | Six local checks passed, including transaction races, cross-owner denial, unchanged direct-client rules, deletion/retry and quota; `assessment-firestore-results.txt` |
| Same emulator run with `BK_ASSESSMENT_PACKAGED_SDK=1` | Tests the isolated deployment SDK; `assessment-packaged-firestore-results.txt` |
| `node node_modules/playwright/cli.js test --config tests/member-assessment.config.mjs --workers=1 --trace=off --global-timeout=120000` | Six synthetic account-preview checks passed; no provider/database connection |
| `node node_modules/playwright/cli.js test --config output/playwright/member-candidate.config.mjs --workers=1 --trace=off --global-timeout=120000` | Eight synthetic checks passed, including prepared workout-page integration and mobile CSP/layout; `member-candidate-browser-results.txt` |
| `node scripts/build-assessment-function.mjs --check` | Four packaged modules match canonical source exactly |
| Local package discovery | Only `assessmentAccount` exported; exact proposed identity/region/limits verified; `assessment-function-discovery.json` |

The local emulator is the fixed `demo-bk-assessment` project on loopback, never
production. Tests use synthetic accounts/answers. Real production sign-in,
deployed IAM and account writes are not proven by these checks.

The new package pins Firebase Admin 14.5.0 and Firebase Functions 7.3.2. Admin
14.3.0 inherited a moderate transitive UUID advisory; only this undeployed package
was updated. Its install now reports zero npm advisories. Existing Functions
manifests/lockfile and production were not upgraded.

The actual currently available review engine is Codex. The installed Claude CLI
has a mode that excludes global memory and tools, but that safe mode has no
configured authentication in this task. No new Claude review was sent; no Grok,
Muse or Antigravity tool is callable. Earlier reviews are recorded separately
and do not establish review of this new code. No AmPac content was included.

## Preview and post-approval release

The local synthetic review page is `/member-assessment-preview.html` on the
filtered localhost preview. It is explicitly a simulation and is excluded from
Hosting, along with its fixture script. Mobile screenshots contain synthetic
data only. Source and package preparation make no cloud mutation.

After explicit permission approval: re-read live Hosting/config and existing
IAM first; create/bind only the reviewed new principal/role; dry-run the exact
scoped function target using `firebase.assessment.json` and the personal owner
account; deploy only `functions:bk-assessments:assessmentAccount`; verify options,
flag and anonymous denial; then build/release the nine-path public overlay from
the freshly pinned clean live manifest. Preserve every unrelated hash and all
current Hosting settings. Never deploy the stale root Functions source or the
root Hosting tree. A real signed-in journey still requires an explicitly
authorized synthetic test identity and normal App Check, or Brian's own manual
acceptance; no attestation/debug bypass is prepared.

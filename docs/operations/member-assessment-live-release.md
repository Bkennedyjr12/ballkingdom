# Member assessment production release

The opt-in member interface and isolated backend are deployed. Real signed-in
save/delete acceptance remains unverified; publication alone does not prove it.

- Member entry: https://ballkingdom.com/workouts#member-assessments
- Guest assessment: https://ballkingdom.com/ai-assessment
- Native assessment and optional Base44 entry: https://ballkingdom.com/ai-readiness
- Source commit: `abc0630d657f77a0381de63b8bbd3faa3c7db439`
- Review: https://github.com/Bkennedyjr12/ballkingdom/pull/20

## Deployment and preservation receipts

Only personal project `the-ballers-kingdom` and Hosting site `ballkingdom-com`
were targeted. Brian explicitly approved the described runtime identity,
database/Auth status permissions, public callable invocation, usage charges
and deployment with “Of course approved.” No payment or email permission was
included. No service-account key was created.

Hosting version `fb0c79190845f999`, release `1791729507410000`, published
`2026-10-11T14:38:27.410Z`. It contains 179 active public paths: nine changed/new,
170 unrelated hashes preserved, two added assets and zero deletions. All Hosting
configuration is unchanged, including workout no-store headers and the existing
public index fallback. The clean prior version `4be02151b6597aec` is the rollback
for this member interface. Do not roll back to a historical contaminated release.

`assessmentAccount` is ACTIVE in `us-west1`, revision
`assessmentaccount-00001-zah`; created `2026-10-11T14:34:35.472488917Z`, updated
`2026-10-11T14:35:36.609010715Z`. It uses Node 22, 256 MiB, one CPU, zero minimum
instances, maximum two instances, concurrency 20 and a 30-second timeout.
`BK_ASSESSMENT_ACCOUNT_ENABLED=true` is set on this endpoint only. No secret
environment variable, secret volume or event trigger exists.

Dedicated identity:
`tbk-assessment-account@the-ballers-kingdom.iam.gserviceaccount.com`.
Custom role `projects/the-ballers-kingdom/roles/tbkAssessmentRuntime` has exactly
the seven permissions in [the approved role definition](assessment-runtime-role.proposed.json).
They permit Firestore transactions/entity operations and authoritative Firebase
Auth status reads. The role is at project/database scope; application code
confines requests to the verified member's assessment namespace. It does not
provide collection-only IAM isolation. All unrelated project bindings are
unchanged. Only the new function's Cloud Run service grants `roles/run.invoker`
to `allUsers`; the handler still enforces Auth, verified email, current token
status, exact origin and App Check. No other identity or role was broadened.

The source archive contains exactly seven files from `functions-assessment/`:
the entry point, package manifest/lockfile and four byte-checked generated
modules. The supported [Cloud Functions v2 create API](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/create)
and [source upload API](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/generateUploadUrl)
were used with existing build infrastructure. The CLI's generic event-service
preparation was avoided; no Eventarc/Pub/Sub grant or new build identity was added.

All 51 preexisting function fingerprints remain unchanged. Live Firestore rules
are still `ab166f66-a9d0-4738-985e-3e1144cc0af7`, last updated
`2026-10-05T19:25:51.384377Z`. No Rules, Auth configuration, workout records,
coach grants, Daily Game records, DNS, other Hosting site or payment provider
was changed. Final metadata readback at `2026-10-11T14:44:10.547181Z` confirmed the
exact active 179-path manifest, Hosting config and unchanged rule release.

## Public changes and member behavior

The exact nine public paths are:

- `workouts.html`
- `assets/js/workouts-app.js`
- `assets/js/workouts-production-runtime.js`
- `assets/js/member-assessment-app.js`
- `assets/css/member-assessment.css`
- `assets/js/ai-assessment-app.js`
- `ai-assessment.html`
- `ai-readiness.html`
- `privacy.html`

The same workout tab's named Firebase app, in-memory Auth and existing App Check
provider are reused. Taking or reviewing an assessment does not send answers.
Only Save this result to my account transmits them. Records remain until the
member deletes them. Reopen, cancel deletion, confirmed deletion, retry and
sign-out cleanup are implemented; workout permissions do not expose assessments
to coaches. Minimal counters/deletion receipts contain no answers or scores.
No browser answer/email/token persistence was introduced. The existing App Check
SDK retains its normal attestation cache.

The guest assessment remains tab-memory only. No answers transfer silently from
the guest tab into a member session. No assessment answers are sent to Base44,
QuickBooks or an AI provider. Scoring is original fixed editorial guidance,
not a validated benchmark or a live AI judgment.

Base44 remains optional separate-tab navigation. Live framing restrictions and
missing approved identity/data contracts prevent claiming embedding or cross-
origin SSO/data synchronization. Export or an API bridge would need a separately
reviewed supported contract and permissions; see [the source findings](base44-ai-readiness-integration.md).

## Exact verification and its limits

All Node runs used `/opt/homebrew/opt/node@22/bin/node` (22.23.2).
Ignored raw receipts are under `output/member-assessment-release/`; earlier
foundation/emulator evidence is under `output/reconciliation/`.

| Check | Result |
| --- | --- |
| `node --test functions/test/assessment-service.test.mjs functions/test/assessment-account.test.mjs functions/test/assessment-callable.test.mjs` | 19 passed, zero failures; `predeploy-service-tests.txt` |
| `node --test tests/*.test.mjs` | 112 passed, zero failures; `predeploy-root-tests.txt` |
| `node scripts/build-assessment-function.mjs --check` | All four packaged modules exactly match canonical source |
| `node node_modules/playwright/cli.js test --config output/playwright/member-candidate.config.mjs --workers=1 --trace=off --global-timeout=120000` | Eight synthetic member/mobile/workout checks passed in 48.2s; `predeploy-browser-tests.txt` |
| `node node_modules/playwright/cli.js test --config tests/native-assessment.config.mjs --workers=1 --trace=off --global-timeout=120000` | Five local guest checks passed in 46.9s; `predeploy-native-browser.txt` |
| `node node_modules/playwright/cli.js test --config output/playwright/member-live-regression.config.mjs --workers=1 --trace=off --global-timeout=180000` | 24 live browser checks passed with exit 0 in 1.1m; `live-browser-results.txt`. Equivalent durable config is `tests/member-live.config.mjs`. Includes two real signed-out checks and synthetic owner flows; no real identity or assessment submission |
| Live public-body hash checks | All 18 public pages/assets match the new manifest; both workout HEAD checks preserve no-store |
| Private-path checks | 78 HEAD-only probes across apex, www and own web.app alias passed. Original artifacts are absent from the manifest; returned fallback ETag/type/length match the public index. Zero private artifact bodies read |
| Live callable security | Three POSTs without valid attestation/Auth returned 401 `UNAUTHENTICATED`; allowed-origin OPTIONS returned 204. No member record written |
| Final API readback | Exact role, project IAM, service invoker policy, runtime/flag, Hosting manifest/config, 51 preexisting functions and unchanged rules verified |

Earlier backend checks remain applicable to the unchanged canonical account
modules: 547 function checks, 544 passed with zero failures and three explicit
emulator skips; six explicit Firestore emulator checks passed using both SDK
environments. The emulator tested owner/cross-user/anonymous client denial,
transaction races, duplicate retries, deletion without resurrection, counters
and quota. Its project was fixed `demo-bk-assessment` on loopback, never production.
These checks do not establish a real signed-in production save/delete.

## Remaining acceptance and commerce decisions

**Real signed-in save/delete is not yet verified.** The existing App Check config
was read-only verified to match the runtime key; ballkingdom.com is allowed,
the key is score-based and not a testing key. A fresh automated Chrome profile
received HTTP 403 `PERMISSION_DENIED` with “App attestation failed,” followed by
SDK `appCheck/initial-throttle`. No provider/grant/score setting was changed and
no debug/attestation bypass was used. Human acceptance remains required; matching
configuration does not prove a human session will pass. The normal App Check
diagnostic writes no member record. Earlier diagnostic harness errors were
corrected; the final result is `normal-appcheck-browser.json`.

A separate question requesting two temporary synthetic Firebase accounts is
still unanswered. No test account or sign-in email was created/sent. Brian can
test in his normal browser: sign in through the existing notebook flow, answer
with synthetic values, confirm no save before clicking Save, save/reopen, cancel
deletion, confirm deletion and refresh to verify removal. Alternatively approve
the temporary synthetic account test. Do not claim cross-user production proof
until that separate identity test is authorized and completed.

The private original six-lesson Kingdom AI Playbook draft and workbook remain
excluded from this public GitHub repository and Hosting. No paid Justin Lester
course was accessed or copied. Price/currency, approved public/paid content and
merchant/product/tax/protected-delivery setup remain unresolved. Checkout is
inactive; no paid product, email delivery, subscription or entitlement was
activated. The available review engine was Codex; no new Claude/Grok/Muse review
is claimed and no AmPac private content was used.

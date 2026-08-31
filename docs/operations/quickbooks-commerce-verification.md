# QuickBooks commerce verification evidence

Status: **HOLD — do not deploy or activate the digital pilot**

Verified: 2026-08-30 (America/Los_Angeles)

Source commit before this evidence: `783a664501a93377bcd8ff6e55fa8dcc2afd73cc`

## Decision

The local implementation and its injected provider contracts pass under the declared Node 22 runtime, but the production pilot is not release-ready. The Rules evidence evolved after the original verification: byte-exact deployed originals were retained, reviewed derivatives were mapped at the repository roots, Java/Rules SDK support was installed, and the Firestore/Storage authorization matrix passed 10/10 locally. Those Rules remain undeployed; paid artifact/object placement and active fulfillment runtime remain missing. A separately approved read-only production check at `2026-08-30T23:30:50Z` proved one OAuth refresh and CompanyInfo read for `The Ballers Kingdom`, but the returned rotated refresh credential was intentionally not retained by the test. The deployment-pinned stored credential then failed, and an approved reconnect added new secret versions. Continuing health remains blocked until rotating-credential persistence is fixed, reviewed, deployed, and followed by a fresh safe read. No Intuit sandbox, entity write, invoice send, payment, or refund/reversal handling was verified. A separate read-only signed-in review verified the owning Intuit Developer workspace and production app, as recorded below.

This record does not convert mock results into Intuit sandbox or production truth. It authorizes no deployment, secret creation, email, invoice, payment, refund, webhook configuration, or customer communication.

## Verification boundary

| Evidence class | Result |
| --- | --- |
| Local static/unit/injected-mock tests | Passed as detailed below. |
| Local browser tests | Passed against a local HTTP server and injected browser mocks. |
| Firebase emulator | Current local result: reviewed mapped root Firestore/Storage Rules passed 10/10 authorization tests using Java 21 and `@firebase/rules-unit-testing`. The paid object remains absent and no production Rules deployment occurred. |
| Intuit sandbox | Not accessed; no sandbox entity was created, read, sent, paid, or refunded. |
| Signed-in/read-only provider truth | On 2026-08-30, a browser review verified workspace `The Ballers Kingdom`, app `TBK Q.B A.I`, its production marker, and an empty production webhook endpoint. At `2026-08-30T23:30:50Z`, a process-memory-only check received HTTP `200` for OAuth refresh and CompanyInfo and matched CompanyName `The Ballers Kingdom`; the returned rotated refresh credential was intentionally not retained. Reuse of the deployment-pinned stored credential then failed. Brian approved reconnect, the existing callback completed, and enabled version 3 metadata was observed for the refresh-token and realm secrets; older versions remain enabled and no value was read. No fresh health read followed. |
| Production | No provider or Firebase production mutation, dry run, secret read, customer/entity read, or outbound effect occurred. |

## Reproducible local results

Clean installs:

- `npm ci` — passed; 18 packages installed; root audit at install reported 0 vulnerabilities.
- `npm --prefix functions ci` — passed; 292 packages installed; the ambient Node 25 runtime produced the expected engine warning because Functions declares Node 22.

Ambient Node `v25.9.0`:

- `npm run test:storefront` — passed: 18 content/unit tests and 4 storefront browser tests.
- `npm --prefix functions test` — passed: 324 tests total, 322 passed, 2 explicit environment-gated skips.
- `npm --prefix functions run check` — passed.

Declared runtime parity with `/opt/homebrew/opt/node@22/bin/node` (`v22.23.2`):

- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test:storefront` — passed: 18 content/unit tests and 4 storefront browser tests.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm --prefix functions test` — passed: 324 total, 322 passed, 2 explicit environment-gated skips.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm --prefix functions run check` — passed.

Focused injected-mock/provider verification under Node 22:

```text
node --test \
  test/commerce/commerce-service.test.js \
  test/commerce/quickbooks-invoices.test.js \
  test/commerce/quickbooks-payment-verifier.test.js \
  test/commerce/quickbooks-webhooks.test.js \
  test/commerce/refunds.test.js \
  test/commerce/service-invoicing.test.js \
  test/commerce/fulfillment.test.js \
  test/providers.test.js
```

Result: 222 passed, 0 failed, 0 skipped. The mocks cover the documented Accounting Invoice send method/path and response envelope; exact Invoice/Payment rereads; unpaid, delayed, exact-paid, partial, split, over/under, wrong-realm, wrong-reference, voided/deleted/reversed, and ambiguous evidence; parallel order and Invoice suppression; separate redacted auth/invoice effects; pre- and post-dispatch recovery; no resend after ambiguous dispatch; scheduled recovery; service approval; fulfillment retry/single-use grants; webhook signature/raw-byte/realm/size/count/hint controls; and refund fail-closed/reconciliation behavior.

- `npx playwright test tests/commerce-browser.spec.mjs` under Node 22 — passed: 13 browser journeys. These use `window.__BALLERS_COMMERCE__` mocks and prove browser fail-closed behavior only.

The local Graph tests inject a fake fetch implementation. The synthetic generated sign-in link stays in memory and the sender-identity check fails closed. The Auth emulator out-of-band completion flow was **not** proven because the emulator suite could not start.

## Historical failed emulator attempt and current result

Attempted exactly:

```bash
firebase emulators:exec --only auth,firestore,storage,functions "npm --prefix functions test" --project the-ballers-kingdom
```

Historical result: this original attempt failed before startup because `java -version` exited 1. No emulator or provider effect ran then. Subsequently, Java 21 and the Rules SDK were installed under approval; the root-mapped Firestore/Storage authorization matrix passed 10/10 under demo project `demo-ballkingdom-commerce` with no production access.

The following bullets describe the historical state at the failed attempt; current disposition follows each item:

- **Resolved locally:** root Rules now byte-match reviewed derivatives of the recovered production policies.
- **Resolved locally:** `firebase.json` explicitly maps both Rules files and Firestore indexes.
- The production Storage bucket is verified as `the-ballers-kingdom.firebasestorage.app`, but the paid-object prefix and per-SKU object placement are unverified and no paid pilot artifact exists there.
- **Resolved locally:** the Rules SDK is installed and signed-out/ordinary/correct-owner/wrong-owner/admin proof passes.
- The Functions/Firestore/Storage fulfillment runtime is intentionally unwired pending those facts.

Historical pre-mapping fragment hashes, which are **not** current root hashes or production-source evidence:

- `firestore.rules`: `c33aa73684250b52184999a3da0abe1825a5286f65014ebf8287155d47c37504`
- `storage.rules`: `c5b5a5dd70201822c901e439030b0491fec980424c40c97569c1c3141ddbedcc`

## Dependency and repository security checks

- `npm audit --omit=dev` — passed: 0 vulnerabilities.
- `npm --prefix functions audit --omit=dev` — exit 1: 7 moderate, 0 high, 0 critical. The reported chain is the existing transitive `uuid` advisory through `gaxios` / `teeny-request` / `retry-request` / `@google-cloud/storage` and Firebase Admin/Functions. npm proposes a semver-major, breaking Firebase Admin downgrade for the aggregate chain. No forced dependency change was made. This must be dispositioned before production release; no high/critical runtime issue was waived.
- `python3 ~/.codex/skills/secure-ai-operator/scripts/secure_repo_check.py .` — exit 2 because it found 13 credential-shaped lines. Manual inspection confirms all 13 are synthetic test fixtures such as `synthetic-verifier-token`, `must-not-be-stored`, `client-secret`, and `refresh-token`; no production credential was identified.
- `git diff --check` — passed before evidence creation.
- No repository `firebase-debug.log`, other local log, or `.secret.local` file was present.

## Reviewed project parameters and secret boundary

`functions/.env.the-ballers-kingdom` is tracked through the exact `.gitignore` exception and is the only `.env*` file directly under `functions/`.

SHA-256: `dcb372dcbc90eb02275a524b0a7cdfd4a78e231f757460fabd8c7b50ab778a38`

Exact content:

```dotenv
COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=false
COMMERCE_SERVICE_QBO_SEND_ENABLED=false
```

The file has exactly 2 lines / 85 bytes. It contains no email, credential, customer data, or unrelated setting. Tracked-source search found `COMMERCE_PILOT_RECIPIENT_EMAIL` only as a secret **name** in code, tests, and operations documentation; no value is assigned in tracked source. Synthetic fixture addresses use reserved test domains. No `.secret.local` was created, so none requires removal.

Actions performed by this verification:

- Production Microsoft Graph authentication emails sent: **0**.
- Production QuickBooks invoice emails sent: **0**.
- Production/sandbox QuickBooks customers, items, invoices, payments, or refunds created or changed: **0**.
- Production Firebase secrets read or written: **0**.

Those zeroes describe this task's actions; no provider mailbox or company ledger was queried to assert global account history.

## Firebase packaging review

Read-only target resolution passed:

```text
project: the-ballers-kingdom
Hosting target: public -> ballkingdom-com
Functions source/codebase/runtime: functions / ballkingdom-integrations / nodejs22
```

`firebase.json` keeps Hosting rooted at `.` but excludes `functions/**`, `tests/**`, `docs/**`, Rules and indexes, dotenv/dotfiles, Node modules, Playwright outputs/config, backend/output/video directories, private Home Inspection inputs/audits/scripts/source, package manifests, and the redirect-hosting source. Existing content tests verify these exclusions and mutable JS/CSS revalidation.

The actual deploy manifest was not generated because every `firebase deploy --dry-run` was intentionally prohibited in this task: Firebase warns that dry runs may enable project APIs, and no production-impact approval was granted. Therefore this review proves configuration and tests, not the exact CLI-produced Hosting/Functions/Rules manifest. No dry run or deployment was attempted.

Current mapped-but-undeployed configuration is intentional:

- Firestore maps reviewed `firestore.rules` and `firestore.indexes.json`.
- Storage maps reviewed `storage.rules`; the production bucket identity is verified, but no paid artifact is present or active.
- The local target command confirms `public -> ballkingdom-com`.
- The full codebase dry run remains pending until the exact recipient secret exists under separate approval.

## Unresolved release blockers

1. Rules source preservation, narrow merge review, root mapping, Java/SDK installation, and the client-authorization emulator matrix are complete locally. They remain undeployed and require a separately approved release review.
2. Approve and place the exact paid artifact in the verified bucket, then retain its metadata/hash and approve its private SKU mapping before runtime activation.
3. The persistent transaction and private stream adapters are implemented locally, but runtime remains `ready:false`; prove the final exact artifact binding before any activation.
5. Implement or explicitly defer a documented authoritative QuickBooks refund/reversal reader. Current runtime correctly fails closed, so production refund handling is not complete.
6. Continuing production Accounting OAuth health is blocked by `rotating_token_persistence_runtime_fix_unreviewed_undeployed`. Preserve the first dated success as historical evidence only. Review and deploy safe rotating-token persistence before any fresh health read; do not treat reconnect callback success or new secret-version metadata as health proof.
7. Verify Intuit sandbox access and run the no-send sandbox entity/readback matrix. No sandbox truth was established here.
8. App ownership/access is resolved: read-only verification found workspace `The Ballers Kingdom` and production app `TBK Q.B A.I`. The production webhook endpoint is not configured. Webhook setup remains an optional, separately approved control-plane change; its absence does not block a scheduled-reconciliation-only pilot after every other gate passes and Accounting OAuth works authoritatively. Scheduled reconciliation remains mandatory either way.
9. Disposition the seven moderate transitive Functions advisories with a supported dependency path; do not use the audit tool's breaking downgrade blindly.
10. Obtain separate approvals for every scoped Firebase dry run and later deployment. The exact CLI-produced manifest, release-state parameter load, and secret prompt behavior remain unverified until then; repository Rules mappings are locally verified but undeployed.
11. Keep the production recipient secret and both outbound email approvals pending. The Task 11 state remains exactly digital `false`, service `false`.

## Release recommendation

**HOLD.** The application contracts and local Rules matrix are green and fail closed, but deployment or pilot activation must wait for the exact paid artifact evidence, active binding review, Accounting health gates, and every separate approval. Scheduled reconciliation can substitute for an unavailable webhook only after authoritative Accounting and production release proof exists; it cannot substitute for the missing artifact or inactive fulfillment runtime.

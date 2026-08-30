# QuickBooks commerce verification evidence

Status: **HOLD — do not deploy or activate the digital pilot**

Verified: 2026-08-30 (America/Los_Angeles)

Source commit before this evidence: `783a664501a93377bcd8ff6e55fa8dcc2afd73cc`

## Decision

The local implementation and its injected provider contracts pass under the declared Node 22 runtime, but the production pilot is not release-ready. A later read-only preflight retained byte-exact originals from both current deployed Rulesets and identified the active Storage bucket; those originals remain unmerged and unmapped, while paid artifact/object mapping, Rules emulator proof, and the persistent fulfillment runtime remain missing. A separately approved read-only production health check at `2026-08-30T23:30:50Z` verified the current Accounting OAuth refresh and CompanyInfo read for `The Ballers Kingdom`; it did not verify Intuit sandbox, entity writes, invoice sending, payments, or refund/reversal handling. A separate read-only signed-in review verified the owning Intuit Developer workspace and production app, as recorded below.

This record does not convert mock results into Intuit sandbox or production truth. It authorizes no deployment, secret creation, email, invoice, payment, refund, webhook configuration, or customer communication.

## Verification boundary

| Evidence class | Result |
| --- | --- |
| Local static/unit/injected-mock tests | Passed as detailed below. |
| Local browser tests | Passed against a local HTTP server and injected browser mocks. |
| Firebase emulator | Blocked before emulator startup by the missing Java runtime. Byte-exact deployed Rules originals are now retained as evidence, but reviewed commerce merges, `firebase.json` mappings, `@firebase/rules-unit-testing`, paid-object mapping, and runtime authorization proof remain absent. |
| Intuit sandbox | Not accessed; no sandbox entity was created, read, sent, paid, or refunded. |
| Signed-in/read-only provider truth | On 2026-08-30, a read-only browser review verified Intuit Developer workspace `The Ballers Kingdom`, app `TBK Q.B A.I`, its `IN PRODUCTION` marker, and an empty production webhook endpoint. At `2026-08-30T23:30:50Z`, a separately approved process-memory-only check received HTTP `200` for OAuth refresh and CompanyInfo and matched CompanyName `The Ballers Kingdom`. No credential, realm, token, or payload was retained. These checks do not prove sandbox, writes, invoice delivery, payment, refund, webhook delivery, or settlement. |
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

## Emulator gate

Attempted exactly:

```bash
firebase emulators:exec --only auth,firestore,storage,functions "npm --prefix functions test" --project the-ballers-kingdom
```

Result: failed before startup because `java -version` exited 1 (`Unable to locate a Java Runtime`). No emulator ran and no provider effect was dispatched. No Java software was installed.

Even with Java, release remains blocked because:

- `firestore.rules` and `storage.rules` are tracked, commerce-only local deny fragments, not the recovered authoritative production policies.
- `firebase.json` intentionally maps neither file; the mapping assertion exits 1.
- The production Storage bucket is verified as `the-ballers-kingdom.firebasestorage.app`, but the paid-object prefix and per-SKU object placement are unverified and no paid pilot artifact exists there.
- `@firebase/rules-unit-testing` is absent, and signed-out/ordinary/customer-owner/wrong-customer/admin authorization proof has not run.
- The Functions/Firestore/Storage fulfillment runtime is intentionally unwired pending those facts.

Local fragment hashes, which are **not** production-source evidence:

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

Current blocking configuration is intentional:

- Firestore has only `firestore.indexes.json`; there is no Rules mapping.
- There is no Storage block or bucket/Rules mapping.
- The local target command confirms `public -> ballkingdom-com`.
- The full codebase dry run remains pending until the exact recipient secret exists under separate approval.

## Unresolved release blockers

1. Preserve the recovered production Firestore Rules source and hash; merge commerce policy without losing unrelated live policy; map only after review.
2. Preserve the recovered production Storage Rules source and hash; approve and place the exact paid artifact in the verified bucket, then review its private prefix and SKU object mapping before any Rules/runtime wiring.
3. Install/verify a Java runtime and the Rules test SDK, then pass the complete Auth/Firestore/Storage/Functions emulator matrix against the merged authoritative policies.
4. Implement and emulator-prove the real persistent fulfillment runtime and atomic single-use grant redemption against the verified bucket/object mapping.
5. Implement or explicitly defer a documented authoritative QuickBooks refund/reversal reader. Current runtime correctly fails closed, so production refund handling is not complete.
6. Production Accounting OAuth health is resolved for the dated `2026-08-30T23:30:50Z` check only. Repeat the same sanitized read-only check if release timing or connection state makes that evidence stale; do not treat it as sandbox or entity-write proof.
7. Verify Intuit sandbox access and run the no-send sandbox entity/readback matrix. No sandbox truth was established here.
8. App ownership/access is resolved: read-only verification found workspace `The Ballers Kingdom` and production app `TBK Q.B A.I`. The production webhook endpoint is not configured. Webhook setup remains an optional, separately approved control-plane change; its absence does not block a scheduled-reconciliation-only pilot after every other gate passes and Accounting OAuth works authoritatively. Scheduled reconciliation remains mandatory either way.
9. Disposition the seven moderate transitive Functions advisories with a supported dependency path; do not use the audit tool's breaking downgrade blindly.
10. Obtain separate approvals for every scoped Firebase dry run and later deployment. The exact Hosting manifest, release-state parameter load, Rules mappings, and secret prompt behavior remain unverified until then.
11. Keep the production recipient secret and both outbound email approvals pending. The Task 11 state remains exactly digital `false`, service `false`.

## Release recommendation

**HOLD.** The application contracts are locally green and fail closed, but Task 12 must not begin deployment or pilot activation until blockers 1–4 are resolved and every remaining applicable approval/evidence gate is satisfied. Scheduled reconciliation can substitute for an unavailable webhook only after authoritative Accounting and Firebase authorization/fulfillment proof exists; it cannot substitute for missing Rules, bucket mapping, or persistent fulfillment.

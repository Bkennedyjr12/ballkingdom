# Ballers Kingdom Base44 integration — preview release

Current status: the native assessment and optional Base44 links are live. The approved [member notebook and isolated backend are also deployed](member-assessment-live-release.md); real signed-in save/delete acceptance remains unverified. Paid checkout remains inactive. Historical preview/approval notes below describe earlier checkpoints.

Prepared October 10, 2026. Personal Ballers Kingdom work only.

## Result and integration choice

Brian’s final product target is a Firebase-native assessment, member learning portal, paid courses and guides connected to QuickBooks. This branch supplies a native, tab-memory assessment preview at `/ai-assessment`, a discoverable `/ai-readiness` entry, and optional external Base44 links. The broader paid funnel is not complete. The external links retain explicit contact and account-boundary disclosure. See `firebase-native-assessment-foundation.md` and `firebase-learning-commerce-roadmap.md` for the implemented foundation and remaining commerce work.

| Option | Evidence and decision |
| --- | --- |
| Navigation / deep links | Implemented. The live `/assessment` route works without submitting the hub's contact form. The root hub entry remains available separately. |
| Embedding | Rejected: the live hub returns `X-Frame-Options: DENY`. Do not bypass this header or proxy the app to evade it. |
| Exported code | Official Base44 GitHub guidance supports syncing application code. Its current documented GitHub two-way sync requires Builder or higher, owner access, and a new repository permission grant. No export, account change, or paid plan was authorized or needed here. Export would not automatically migrate Base44 auth, entities, or backend integrations. |
| API / SDK | Official Base44 documentation supports an SDK client in external applications. No cross-service identity contract, entity permission approval, data-sharing decision, or backend credential setup has been supplied. No API bridge or SSO claim is implemented. Service-role credentials belong on an approved backend, never in browser code. |

## Source findings

- Live hub: https://ballers-ready-ai.base44.app/ — the root page asks for name, email, and favorite sports team. The public application code creates a Base44 `Lead` and stores a `bk_hub_lead` marker locally after success.
- Live direct assessment: https://ballers-ready-ai.base44.app/assessment — twelve scored questions across Vision & Leadership, People & Capability, and Systems & Data. The inspected release calculates the score and report in React state. No Firebase session or results transfer is present.
- `/hub` redirects visitors without the local lead marker to the root entry form. A lead marker is not proof of an authenticated user session.
- The hub's “Nothing is shared” line should be reviewed by the app owner against its actual Base44 lead processing and follow-up practices. This integration does not repeat that claim.
- Public bundle inspected: `/assets/index-IU_4rw2o.js`. Public HTML/security headers were fetched without credentials. No customer entities were enumerated or retrieved.
- Official export guidance: https://docs.base44.com/developers/app-code/local-development/github
- Official client/auth modes: https://docs.base44.com/developers/skills/base44-sdk/references/client
- Canonical public repository: https://github.com/Bkennedyjr12/ballkingdom. Fresh isolated checkout began from `e2fafaf972720748d14c485a0e38099fd109cb3b`. The existing Mac checkout was behind remote main and contained unrelated untracked work; it was preserved.
- `HOSTING.md`, `.firebaserc`, and `firebase.json` agree: public site `ballkingdom-com`, target `public`, project `the-ballers-kingdom`. The inspector, companion, redirect site, DNS, mail, backend integrations, and stored user records are outside this release.
- Relevant ECOAI operating memory and local Firebase deploy-review instructions were checked. No private AmPac records or personal fitness/health details were included in the change or review prompt.

## Privacy and preservation

Both outgoing links are fixed HTTPS URLs with `target="_blank"`, `rel="noopener noreferrer"`, and `referrerpolicy="no-referrer"`. The page also sets a no-referrer policy. Query strings, tokens, contact details, plans, journals, and Firebase credentials are never interpolated into the outgoing URLs. The landing page embeds no Base44 scripts, frames, fonts, preconnects, or background requests.

The assessment is available directly; the hub contact gate is disclosed separately. The original tab remains available for cancel, failed-load recovery, and retry. There is no result persistence promise: the inspected Base44 report is kept in that app's component state and can reset on refresh.

No deployed Firebase Auth, Firestore, Storage, Functions, security rules, commerce flags, OAuth, user plans or records changed. Thirty-four already-live public source files were recovered byte for byte, including workout/accountability assets, bundled Firebase SDK modules, and the updated Your Game page. The native assessment service is an unexported, default-disabled source module with synthetic tests; it creates no deployed endpoint. The public privacy page explains the external service boundary.

## Changed files

- `ai-readiness.html`: native landing page, separate external destinations, privacy and recovery notice, existing-tool fallback.
- `assets/css/ai-readiness.css`: page-scoped responsive layout, keyboard focus and skip-link styles.
- `index.html`: AI readiness tool card, footer link, stable `#tools` fallback anchor.
- `readiness.html`: distinguish the existing business scorecard from AI readiness.
- `privacy.html`: disclose external Base44 processing without inventing retention or synchronization promises.
- `sitemap.xml`: publish the canonical clean landing route after release.
- `tests/ai-readiness-browser.spec.mjs`: six journey and boundary checks.
- `ai-assessment.html`, page CSS/app/model, `functions/src/assessment/`, and native tests: original fixed-scoring assessment and an unexported, disabled persistence contract.
- Thirty-four recovered production files: exact live workout, accountability, public chat, Firebase SDK and Your Game source; pinned hashes identify the full list.
- `scripts/build-ai-readiness-overlay.mjs`, baseline metadata and six overlay tests: reproducible additive release preparation.
- `tests/production-preservation-browser.spec.mjs`: preserved chat plus synthetic signed-out/owner workout journeys.
- `playwright.config.mjs`, native test config, `scripts/test-static-server.py`, `package.json`: register browser/build commands and use a loopback server with enough connection backlog for the existing module graph; no dependency additions.
- `firebase.json`: retain live workout no-cache headers and exclude build/test scripts from root Hosting.
- `HOSTING.md` and operations notes: public root-deploy hold, source evidence, release scope and remaining decisions.

## Verification

Baseline: `npm run test:your-game` (5 passed) and `npm run test:storefront:unit` (36 passed).

Final local static-site tests:

```sh
node --test tests/*.test.mjs
/opt/homebrew/opt/node@22/bin/node node_modules/playwright/cli.js test --config output/playwright/local.config.mjs --workers=2
```

The final root browser command exits successfully with 49 passed (34.5 seconds). The separate native command exits successfully with five passed (32.8 seconds). The local ignored config imports the repository config and selects installed Chrome because the expected Playwright headless-shell cache is absent. It does not use Brian's signed-in Chrome profile. Root browser dependencies were reused through a local-only symlink. Functions dependencies were installed from the unchanged lockfile in this isolated checkout with install scripts disabled. No browser installation or package-manifest change occurred.

Initial integration results: 51 unit checks and 46 browser checks passed. After recovering live source and adding the native foundation, the root Node suite passes 107 checks, including browser/server model parity. The root browser suite passes 49 checks, and the native browser suite passes five checks in its separate config. Earlier Node 25 runner shutdowns were interrupted after completed assertions; only clean Node 22 exits are counted as final browser verification. The six new integration checks cover discoverability, retained tools, no Base44 requests before click, fixed external URLs, absent referrer/auth/cookie forwarding in a fresh context, null opener, original-tab preservation, synthetic saved-state preservation, failed-load retry, mobile no-overflow at 390 × 844, and keyboard focus. An initial red run confirmed the homepage assessment card was missing before implementation.

Live signed-out probe:

```sh
node output/playwright/live-base44-probe.mjs
```

A fresh isolated browser loaded the public assessment. Every non-read network method was blocked, including analytics, page-view logging, and attempted lead creation. Twelve synthetic zero-score choices produced 0/36 and Foundation Year. Verified unanswered Next disabled, answer review, restart clearing answers, Back cancellation, mobile no-overflow, skip-to-hub contact gate, blank-entry validation, and an intercepted lead-write failure with retry enabled. No real assessment or contact data was submitted and no lead record was created by this probe.

Limits: synthetic saved browser state and mocked owner runtime are preservation tests, not real signed-in Firebase/SSO tests. No real authenticated member account was used, no successful Base44 lead was written, and no existing user records were read. The first Functions run had two missing-module load failures. After installing dependencies from its unchanged lockfile with install scripts disabled, the final Node 22 run passes 518 of 520 checks with zero failures; two emulator checks are explicitly skipped because Firestore/Storage emulators are not running. The seven new disabled-service tests pass. Live authorization/rules enforcement and a backend release are not verified by these results.

Staged diff whitespace verification passes except one inherited whitespace line in the hash-pinned Firebase vendor SDK, retained byte for byte. No credential pattern was found in the staged source/test/document files; no output artifact was staged.

Local evidence (ignored and excluded from Hosting): `output/playwright/unit-results-final.txt`, `browser-results-final.txt`, `native-browser-results-final.txt`, `native-browser-report.json`, `base44-live-evidence.json`, `ai-readiness-mobile.png`, `native-assessment-mobile-questions.png`, `native-assessment-mobile-results.png`, and `base44-synthetic-results-mobile.png`. Mobile screenshots were visually inspected and contain public pages/synthetic answers only. Library's required batch helper stopped before preparing files with “Library prepare_uploads is not available”; one supported recovery failed identically, and read-only discovery confirmed the helper catalog lacks upload preparation. No Library save is confirmed. Local PNG deliverables remain available.

## Review evidence

Actual ECOAI work used Codex implementation/audit workstreams, Claude Code 2.1.296, Muse Code 1.4.3 (1.4.3-R5018.1), and Antigravity's `agy` headless CLI. Two bounded Claude reviews completed on public source with tools, customizations, MCP access and session persistence disabled. Muse and Antigravity completed bounded conceptual architecture reviews with public prompts; those reviews are not independent code verification. No private AmPac or member data was supplied.

Grok 1.0.44 was invoked on a bounded public build-plan prompt but did not complete a review: its configured MCP adapters failed handshake/schema validation. Only that attempted review process was stopped. No global configuration, persistent grant, paid plan or agent installation was changed. Grok review is blocked, not claimed as complete. Detailed local review outputs remain ignored under `output/reconciliation/`.

The first Claude reviewer raised a possible clean canonical URL mismatch because the supplied diff omitted the existing Hosting config. Readback confirms `cleanUrls: true`, so Firebase serves the extensionless routes; official behavior is documented at https://firebase.google.com/docs/hosting/full-config#cleanurls. The native review requested proof that the generated browser model matches the canonical server model. Exact-byte equality is now enforced by a root test and the overlay build guard. Mobile screenshots were visually inspected; broader accessibility certification is not claimed.

One pre-existing FAQ behavior was observed: “Digital products” matches the consulting keyword before the products keyword and links to `/yvp`. Its exact live source was preserved; this unrelated behavior is recorded for a separate correction.

## Authoritative production reconciliation

The latest live channel was read using the existing personal owner identity and scoped read-only Hosting API calls. It is finalized version `e33289aa8931f7ee`, released October 6, 2026 at 20:59:23.206 UTC, with deployment-tool label `tbk-scoped-workout-launch`, 1,489 files and the message “Reviewed email-request diagnostics, sign-in recovery and confirmed-save UX; existing site preserved.” No credential values were printed or copied.

The authoritative public source was recovered from the previous personal Ballers Kingdom October 5 `ballkingdom-unified-review` checkout, and verified against the live release using Firebase’s SHA-256 of level-9 gzip bytes. The two homepage chat references are preserved. Thirty-four public files absent or stale on GitHub main were restored byte for byte; every recovered source hash is pinned in `ai-readiness-live-baseline.json`. The existing workout HTML `private, no-store, max-age=0` headers were restored in the source config. Backend and rules changes in the previous checkout were deliberately not imported into a Hosting change; their live release remains authoritative for any later backend work.

The inventory also revealed 1,318 inherited hidden worktree/internal artifact paths in the live release. Their bodies were not fetched or copied into this branch. Three other live ordinary files lack a local source match: Firebase reserved init files and `rebuild_form.gs`. Their existing hashes are retained by the overlay. This does not establish that the unknown/internal content is safe or private; review and cleanup require a separate production decision. Do not blindly republish a root checkout or remove those paths as part of an assessment release.

A reproducible local-only overlay builder uses the pinned full manifest digest and exact current Hosting configuration. It accepts the read-only live snapshot only if version, count and all hashes match. It verifies recovered source, compresses only the ten approved assessment/integration public paths, retains every unrelated hash, and emits no deletion. It performs no network call or deployment. Unknown artifacts are retained as existing metadata references, never materialized into a new upload blob. Publication remains blocked for the internal-artifact decision and explicit Brian approval. A metadata-only follow-up confirmed representative artifacts are publicly reachable through HEAD checks; see `hosting-artifact-review-checkpoint.md`. Retaining hashes establishes compatibility, not approval to carry these artifacts into a new release. The generated plan explicitly sets `publicationBlocked: true`.

```sh
npm run build:native-assessment
npm run build:ai-readiness-overlay -- output/reconciliation/hosting-live-files.json
```

Expected local plan: 1,495 total files, 1,485 existing files unchanged, ten changed/new public paths, zero deletions, exact Hosting configuration retained. The read-only source snapshot, manifest comparison and blob payloads remain ignored under `output/reconciliation/` and `output/ai-readiness-release/`; no user or purchaser data is present in the new blobs. Six meaningful builder tests verify additive preservation, stale-version/hash rejection, recovered-source drift, traversal/duplicate rejection and inherited-artifact handling.

## Preview and release

Local preview: http://127.0.0.1:8899/ai-readiness.html
Homepage preview: http://127.0.0.1:8899/index.html#tools

No Firebase deployment, domain change, or new permission grant has occurred. No CI workflow is configured in this repository; do not describe the local preview as a hosted Firebase preview.

There is no approved production command for the root checkout. `firebase deploy --only hosting:public` would reconstruct a different full file set and is not the release path for this drifted site. The prepared additive Hosting overlay must be reviewed against a freshly reread live channel before any separately authorized preview or live publication. This branch includes no publishing script.

Only project `the-ballers-kingdom`, site `ballkingdom-com`, may be considered. Preserve its pinned configuration and live workout/chat assets. Inspector, companion, redirect, Functions, rules, DNS and unrelated domains remain outside this Hosting release. After an approved publication, verify the previous live release is available for rollback and smoke-check `/`, `/ai-readiness`, `/ai-assessment`, `/readiness`, `/your-game`, `/growth`, `/soccer` and `/workouts`.

Local `ecoai-firebase-deploy-review/SKILL.md` requires explicit Brian approval before `firebase deploy`. The parent also explicitly withheld any Firebase deployment until approval. No cloud preview or production publication occurred.

## Remaining decisions

1. Review the inherited internal-artifact paths and choose a separately approved cleanup/release approach. Production is unchanged; the hash-preserving overlay is ready for review, not publication.
2. Choose one-time purchases versus recurring membership and the first approved course/guide contents, prices and product-specific accounting/tax mappings. The existing study guide’s item/price/tax cannot authorize new products.
3. Verify current personal QuickBooks Accounting health and merchant payment capability; implement current CloudEvents handling and durable replay receipts, ongoing reversal reconciliation and atomic entitlement revocation before checkout activation. The audited source webhook returns 404 and its parser rejects CloudEvents arrays; this workstream did not independently probe the live backend endpoint.
4. Approve assessment retention/deletion and implement the real Auth/App Check/repository/rules adapter before enabling saves. Select any AI provider and its data/cost boundary before sending answers to a model; the preview uses fixed scoring only.
5. Test real signed-in recovery with an authorized test account after access and release approval. Existing synthetic owner-runtime checks are preservation evidence, not real production authentication proof.
6. If Base44 export/migration is desired, obtain its supported owner export access under the account’s plan. No new Base44 permission, paid upgrade, proprietary backend copy or records migration was performed. Have its owner review contact consent wording.

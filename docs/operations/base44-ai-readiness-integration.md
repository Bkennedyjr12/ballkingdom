# Ballers Kingdom Base44 integration — preview release

Prepared October 10, 2026. Personal Ballers Kingdom work only.

## Result and integration choice

Add a discoverable AI Readiness card to the homepage, a link from the existing Business Readiness Scorecard, and a native `/ai-readiness` landing page. The landing page opens the assessment and hub in separate tabs after an explicit visitor click. It explains contact collection and the separation from existing Firebase sign-in and saved data.

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

No Firebase Auth, Firestore, Storage, Functions, security rules, commerce activation, OAuth, workout-plan, or migration code changed. Existing Your Game and Inner Game storage behavior and public training links remain intact. The public privacy page adds a factual explanation of the external service boundary.

## Changed files

- `ai-readiness.html`: native landing page, separate external destinations, privacy and recovery notice, existing-tool fallback.
- `assets/css/ai-readiness.css`: page-scoped responsive layout, keyboard focus and skip-link styles.
- `index.html`: AI readiness tool card, footer link, stable `#tools` fallback anchor.
- `readiness.html`: distinguish the existing business scorecard from AI readiness.
- `privacy.html`: disclose external Base44 processing without inventing retention or synchronization promises.
- `sitemap.xml`: publish the canonical clean landing route after release.
- `tests/ai-readiness-browser.spec.mjs`: six journey and boundary checks.
- `playwright.config.mjs`, `package.json`: register the new browser suite; no dependency additions.
- This operations note: evidence, release scope, and remaining decisions.

## Verification

Baseline: `npm run test:your-game` (5 passed) and `npm run test:storefront:unit` (36 passed).

Final local static-site tests:

```sh
node --test tests/*.test.mjs
npx playwright test --config output/playwright/local.config.mjs --workers=2
```

The local ignored config imports the repository config and selects installed Chrome because the expected Playwright headless-shell cache is absent. It does not use Brian's signed-in Chrome profile. Test dependencies were reused through local-only symlinks; no dependency or browser installation occurred.

Observed results: 51 unit checks and 46 browser checks passed. The six new integration checks cover discoverability, retained tools, no Base44 requests before click, fixed external URLs, absent referrer/auth/cookie forwarding in a fresh context, null opener, original-tab preservation, synthetic saved-state preservation, failed-load retry, mobile no-overflow at 390 × 844, and keyboard focus. An initial red run confirmed the homepage assessment card was missing before implementation.

Live signed-out probe:

```sh
node output/playwright/live-base44-probe.mjs
```

A fresh isolated browser loaded the public assessment. Every non-read network method was blocked, including analytics, page-view logging, and attempted lead creation. Twelve synthetic zero-score choices produced 0/36 and Foundation Year. Verified unanswered Next disabled, answer review, restart clearing answers, Back cancellation, mobile no-overflow, skip-to-hub contact gate, blank-entry validation, and an intercepted lead-write failure with retry enabled. No real assessment or contact data was submitted and no lead record was created by this probe.

Limits: synthetic saved browser state is a preservation test, not a real signed-in Firebase/SSO test. No real authenticated member account was used, no successful Base44 lead was written, and no existing user records were read. Functions tests were not rerun because this change does not alter backend code; the existing commerce browser suite did run with its mocked provider boundaries.

Local evidence (ignored and excluded from Hosting): `output/playwright/unit-results.txt`, `browser-results.txt`, `base44-live-evidence.json`, `ai-readiness-mobile.png`, and `base44-synthetic-results-mobile.png`.

## Review evidence

ECOAI tooling inventory confirmed Claude Code 2.1.296, Grok 1.0.44, and Muse Code 1.4.3 (1.4.3-R5018.1). One actual bounded Claude review completed with tools, customizations, MCP access, and session persistence disabled; its input contained only this public-site code and diff. Grok and Muse were version-checked but did not review this change.

The Claude reviewer raised a possible clean canonical URL mismatch because the supplied diff did not include the existing Hosting config. Direct readback of `firebase.json` confirms `cleanUrls: true` on the public target, so Firebase serves `ai-readiness.html` at `/ai-readiness` and redirects the extension form. Official behavior is documented at https://firebase.google.com/docs/hosting/full-config#cleanurls. The concern is resolved by the existing verified configuration, with no Hosting change needed. The reviewer reported no other hard blockers in the supplied files. Mobile screenshots were visually inspected; broader accessibility certification is not claimed.

## Preview and release

Local preview: http://127.0.0.1:8899/ai-readiness.html
Homepage preview: http://127.0.0.1:8899/index.html#tools

No Firebase deployment, domain change, or new permission grant has occurred. No CI workflow is configured in this repository; do not describe the local preview as a hosted Firebase preview.

After review, approval, and the normal PR merge, the intended production command is:

```sh
firebase deploy --only hosting:public --project the-ballers-kingdom
```

Use the existing Ballers Kingdom owner identity, inspect the exact outgoing Hosting manifest, and keep all current Hosting exclusions. Do not deploy `hosting` broadly, the inspector site, redirect site, Functions, rules, or unrelated domains. Confirm the previous public Hosting release is available for rollback, then smoke-check `/`, `/ai-readiness`, `/readiness`, `/your-game`, `/growth`, and `/soccer`.

Local `ecoai-firebase-deploy-review/SKILL.md` requires explicit Brian approval before `firebase deploy`. This preview makes that approval concrete. Production publication remains a separate decision.

## Remaining decisions

1. Approve the linked journey for publication to the existing public Firebase target.
2. If unified login, saved reports, or lead synchronization is desired later, first approve the exact data flow, access boundaries, storage/retention, and any provider plan or new grant. These capabilities are not implied by the links.
3. Have the Base44 owner review lead consent/privacy wording and, if desired, add a visible return link to ballkingdom.com inside the hub. No Base44 authoring connection was created for this task.
4. Perform a real member smoke check after approval using an authorized test account; no credentials should be shared in chat or browser code.

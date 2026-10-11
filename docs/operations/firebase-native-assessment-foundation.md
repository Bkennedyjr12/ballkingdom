# Firebase-native assessment foundation

Current status: the guest assessment is [live](ai-readiness-live-release.md). The later opt-in account service and UI are [prepared, not activated](member-assessment-release-candidate.md). The disabled two-method contract described below is historical; the current candidate adds explicit consent, list/delete, quota and retry protection.

Brian's product target is a Firebase-native assessment, account portal, paid courses and guides, with QuickBooks integration. This preview supplies the assessment foundation only. It does not complete the commercial funnel or migrate Base44 records.

## Implemented preview

`ai-assessment.html` runs twelve original planning questions across vision and leadership, people and capability, and systems and data. All answers use 0–3 points. Four questions contribute to each area (maximum 12); the full total is 0–36. Disclosed ranges are 0–11 for building the basics, 12–23 for testing a pilot, and 24–36 for improving an existing practice. The ranges are editorial planning prompts, not a validated benchmark or certification.

People can go back, review incomplete answers, change an answer, view results, cancel a restart, or confirm a restart. Results identify the lowest areas, including ties, and suggest existing public consulting, development tools, and catalog pages. No price, tax treatment, approved new product, payment method, enrollment, or access grant is inferred from a score.

The page makes same-origin static GET requests only. It does not call Firebase, Base44, QuickBooks, analytics, or an AI provider; parse query parameters; read cookies or browser storage; import existing account, workout, or journal records; or write results anywhere. Answers exist only in the page's JavaScript memory. Reloading, leaving, or closing the page clears them. The page states that account saving and purchases are not connected. A static reload/tools fallback remains if the module cannot load, and JavaScript-disabled browsers receive instructions.

The questions and recommendations were written for this implementation. No Base44 backend, proprietary source, lead form, or user records were copied. This is a new same-domain flow, distinct from the interim external-link page.

## Portable model and reproducible source

The canonical portable model is `functions/src/assessment/model.js`. It contains the versioned questions, fixed scoring, and immutable session transitions without provider, browser, or storage dependencies. The browser copy is generated from that exact file:

```sh
node assets/js/ai-assessment-build.js
```

The generated `assets/js/ai-assessment-model.js` is tracked so a static preview needs no runtime build service. Run the command before verification and release; both model copies must match. A root parity test and the overlay build guard enforce exact-byte equality. `assets/js/ai-assessment-app.js` handles the page with native DOM elements, radio groups and focus management. `assets/css/ai-assessment.css` follows the existing site palette. There are no new dependencies.

## Disabled server persistence module

`functions/src/assessment/service.js` is not imported or exported by the deployed Functions entry point. No endpoint, Auth configuration, Firestore rules, IAM grant, Storage setting or deployed runtime was changed.

`createAssessmentService()` defaults to disabled. Even providing a repository and verifier does not activate it; only the exact server-side Boolean `enabled: true` does. In enabled synthetic tests, the factory requires a server-owned `authenticateRequest(context)` adapter returning a verified UID and verified App Check result. It never accepts an identity, email, price, score, progress, payment state or entitlement from request data. Every save/load invokes the verifier; a claimed UID in a payload cannot establish ownership.

The save payload accepts only `{schemaVersion, answers}` for `bk-ai-readiness-v1`. The service validates all twelve bounded answers and recomputes the report. It generates the assessment ID and timestamp on the server. The repository receives an owner UID separately from the record and must implement `createForOwner(uid, id, record)` and `getForOwner(uid, id)`. The future recommended path is `users/{uid}/aiAssessments/{id}`, with server-only writes and reads permitted only for the authenticated owner. A loaded record must retain that same owner and valid schema; missing or mismatched records return the same not-found error.

This injected boundary is a testable contract, not deployed Firebase enforcement. A production adapter must verify authoritative Firebase identity (including disabled/revoked-account handling), enforce App Check, scope repository access to the owner, and add meaningful rate limits, retention/deletion policy, save retry/idempotency behavior, version migration, emulator authorization tests and operational logging without answer content. Do not enable it until those pieces are implemented and reviewed against the authoritative live rules/configuration.

Persistence has no authority over payment, product prices, course progress, or paid access. Those need the separately reviewed commerce and entitlement boundaries. QuickBooks capability, commercial mode, approved products/prices/tax, content rights and AI-provider processing remain separate decisions. No real transaction or new provider grant was performed here.

## Verification

Test-first evidence: the thirteen new Node tests failed with explicit missing scoring/service assertions before implementation. A fresh-browser incomplete-review test failed because the native page and start action did not exist. After implementation:

```sh
node --test tests/native-assessment-model.test.mjs functions/test/assessment-service.test.mjs
/opt/homebrew/opt/node@22/bin/node node_modules/playwright/cli.js test --config tests/native-assessment.config.mjs --workers=1
node --test tests/*.test.mjs
cd functions && /opt/homebrew/opt/node@22/bin/node --test
```

The first Node command passes 13 tests. The native browser suite passes 5 tests using installed Chrome and a fresh context on localhost port 4174. It verifies unanswered-next blocking, zero answers, back/review retention, changed scores, cancelled/confirmed restart, refresh reset, incomplete review, no external requests or writes, no reads/changes to synthetic account/workout/journal storage, same-domain tools exit, keyboard choice and 390-pixel layouts. It never authenticates a real user or submits a real assessment to a provider.

The root Node suite passes 107 tests in the reconciled working tree. An initial Functions run passed 509 of 511 checks with two load failures from missing `@firebase/rules-unit-testing`. After installing the already-declared dependencies from the unchanged lockfile into this isolated checkout with install scripts disabled, the final Node 22 Functions run passes 518 of 520 checks, with zero failures and two explicit emulator skips. Firestore/Storage emulator authorization checks did not run because no emulators are running. The new seven service tests pass independently. No package manifest, lockfile, deployed rules or runtime changed.

Syntax checks pass for all five new JavaScript modules. Browser evidence is under `output/playwright/native-browser-report.json`; unique traces are under `output/playwright/native-test-results`. Public-only synthetic screenshots are `native-assessment-mobile-questions.png` and `native-assessment-mobile-results.png`. The first visual review identified an offscreen skip-link artifact in a full-page screenshot; anchoring that link to the document corrects it while retaining keyboard access.

## Release boundary

Local preview: the parent's existing localhost server can serve `/ai-assessment.html`. The test server is temporary, bound to 127.0.0.1, and uses its own port and output directory. No hosted preview or production release was performed.

The future public destination is the existing `the-ballers-kingdom` Firebase project, `ballkingdom-com` site (`ballkingdom.com`). This branch registers the native test/build commands and public paths, adds the landing-page entry, and preserves the authoritative live chat/workout files and Hosting settings in its scoped overlay. Private source, Functions, tests, operational docs and result records must stay out of Hosting. Production and cloud preview release each remain separately approval-gated. The broader Firebase funnel is still pending.

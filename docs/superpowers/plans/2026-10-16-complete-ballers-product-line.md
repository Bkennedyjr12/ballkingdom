# Complete Ballers Product Line Implementation Plan

> **For agentic workers:** Use the approved ECOAI parallel execution method; execute owned slices and independently review before publication.

**Goal:** Produce, verify, publish and integrate the approved ten downloads and soccer bundle.

**Architecture:** Private JSON curricula feed deterministic offline HTML/PDF/CSV/ZIP and cover production. Gumroad receives validated deliverables; public site catalog receives verified product IDs and covers only.

**Tech Stack:** Existing Node22, Python, Chrome/Playwright, Gumroad supported CLI or signed-in UI, existing Firebase public artifact builder.

**Spec:** docs/superpowers/specs/2026-10-16-complete-ballers-product-line-design.md (Brian approved Oct16).

## Global constraints

Preserve three existing products/prices; ten new standalone products plus one $69 bundle. Approved individual prices: Life19, Academic19, Career29, Digital29, five soccer products19 each, flagship12. Real logo, Ball Kingdom Coaching, LLC, original exercises/examples, no false credentials/guarantees, no paid files in Git/Hosting, no audience broadcasts, no real self-purchases. Complete approval already includes production/publication/integration; no repeat plan approval.

## Review focus

- Buyer receives all promised files and can open them offline.
- Youth/adult and recreational/competitive adaptations are real and useful.
- Text/diagrams/worksheet space remain usable on every PDF page.
- Correct account/product identity; uncertainty after writes reconciled before retries.
- Public deployment cannot leak commercial source/packages.

## Task 1: Original curricula

- [ ] Consulting worker owns private content/consulting.json (four products).
- [ ] Soccer worker owns private content/soccer.json (five products).
- [ ] Parent owns private content/flagship.json (one product).
- [ ] All consume the shared private content/schema.md; completed fictional examples, distinct worksheets and primary references required.
- [ ] Independently inspect curricula for repeated filler, unsupported claims, practical completeness and full approved coverage. Fix before packaging.

## Task 2: Publishing engine and design

- [ ] Production worker owns private tools/build.mjs and assets; render JSON into accessible offlineHTML, embedded-font searchablePDF, editableCSV, START-HERE/license and ZIP, plus 1600x900 cover.
- [ ] Meaningful checks: missing fields rejected; one package per uniqueID; no remote assets in offline editions; ZIP inventory matches promises; PDFpages/overflow checked and every page rendered.
- [ ] Preserve original logo ratio; inspect all contact sheets and representative full-size worksheets. Parent reviews and requests repairs.

## Task 3: Gumroad delivery

- [ ] Check supported CLI installation/auth without printing credentials; use official release only if needed, otherwise signed-in UI.
- [ ] Reconcile current account/catalog; create drafts idempotently with approved prices, real uploadedZIP, covers and truthful copy.
- [ ] Verify provider readback and uploaded package; publish exact completed products; create bundle from verified five soccer IDs. No audience messages or banking/policy changes.
- [ ] Save non-secret receipts; distinguish saved/published/delivery-tested status. Use provider test mode only; do not send test receipts without specific authorization.

## Task 4: Site integration and release

- [ ] Extend scripts/gumroad-catalog.mjs and generator for consulting/soccer/foundation collections and lane-page placement. Home compact selection; products/shop full catalog.
- [ ] Add source/browser tests pinning all coverage, real IDs/prices, correct links, noJS/mobile rendering and exclusion of private files.
- [ ] Generate sections; verify regressions and independent diff review. Commit/push PR, await CI, merge.
- [ ] Snapshot current production/rollback; build public allowlist artifact and deploy only hosting:public after approval already supplied for this release.
- [ ] Verify provider manifest/live public hashes, product links/covers and final desktop/mobile pages.

# AI readiness production release

Published October 10, 2026 at 7:37:54 p.m. America/Los_Angeles (PDT).
Exact Firebase timestamp: `2026-10-11T02:37:54.289Z`.

The original native assessment and optional Base44 navigation are live:

- https://ballkingdom.com/ai-readiness
- https://ballkingdom.com/ai-assessment
- Homepage tool entry: https://ballkingdom.com/#tools

## Exact release boundary

Project `the-ballers-kingdom`, site `ballkingdom-com` only. Version
`4be02151b6597aec`, release `1791686274289000`, source commit
`4f95e06c9274a476e5875aaeb2f5bf5883f09e4c`. This Hosting publication used the
prepared ten-path overlay after Brian's explicit instruction to make it live.
It did not use the drifted root `firebase deploy` command.

The release has 177 public file hashes: 167 unchanged from the clean 171-file
baseline, ten changed/new paths and zero deletions. Hosting configuration is
identical to that baseline, including private/no-store workout HTML headers.
The uploaded objects were only the ten prepared public gzip blobs. Functions,
Auth, Rules, IAM, Storage, DNS, payments, user records and other hosting sites
were not changed. The clean prior version `4a80d522cc70cc38` is the rollback
baseline; do not roll back to the historical contaminated version.

The earlier cleanup removed 1,318 internal paths. A fresh metadata read found
zero internal paths in this release. Thirty-six HEAD checks across apex, www
and this site's existing web.app alias confirm the representative removed
artifacts remain absent; none of their original bodies was fetched. The three
previously unmatched ordinary file hashes remain unchanged and unread, including
the Apps Script source identified in the cleanup report. This release does not
resolve that separate source/privacy review or recall historical cached copies.

## Source findings and integration choice

The inspected Base44 assessment stores its report in React state. Its hub uses
a name/email lead gate and a local lead marker, which is not verified identity.
The live response has `X-Frame-Options: DENY`, so an iframe is unsupported.
Official Base44 GitHub export requires owner access, an eligible plan and a
repository permission grant; none was provided. Its SDK support alone does not
establish a Firebase identity or data-sharing contract.

The supported current combination is a new original same-domain fixed-scoring
assessment plus explicit optional navigation to Base44. Those links open a new
tab with fixed HTTPS paths, no query-data forwarding, null opener and no referrer.
The assessment sends no answers to Base44 or an AI provider. Firebase sign-in and
results do not synchronize across the origins. Detailed inspected sources and
official links are in [the integration findings](base44-ai-readiness-integration.md).

## Verification

All checks use public pages or synthetic fixtures. No email was sent, purchase
made, real assessment submitted, lead created or existing member record read.

| Check | Exact command / evidence | Result |
| --- | --- | --- |
| Root units at release | `node --test tests/*.test.mjs`, Node 22 | 112 passed, exit 0 |
| Local existing browser suite | `node node_modules/playwright/cli.js test --config output/playwright/local.config.mjs --workers=1 --trace=off --global-timeout=120000` | 49 passed, clean exit 0 |
| Local native assessment | `node node_modules/playwright/cli.js test --config tests/native-assessment.config.mjs --workers=1 --trace=off --global-timeout=120000` | Five passed, clean exit 0 |
| Live integration, catalog, chat and synthetic workout preservation | `node node_modules/playwright/cli.js test --config output/playwright/feature-live.config.mjs --workers=1 --trace=off --global-timeout=120000` | 15 passed, clean exit 0 |
| Live native mobile/privacy/review/restart journey | `BK_ASSESSMENT_LIVE=1 node node_modules/playwright/cli.js test --config tests/native-assessment.config.mjs --workers=1 --trace=off --global-timeout=120000` | Five passed, clean exit 0 |
| Public asset bytes and workout cache headers | `node output/reconciliation/verify-feature-public.mjs` | 14 matching hashes; both workout routes retain no-store |
| Removed exposure | `python3 output/reconciliation/verify-feature-heads.py` | 36 HEAD checks pass; zero artifact bodies read |
| Final Hosting API readback | `output/ai-readiness-release/final-live-metadata-check.json` | Exact 177 hashes, finalized version, unchanged config, zero internal paths |

Two initial live runs failed expectations for Firebase's existing clean-URL
redirects. The tests now accept both local `.html` and production clean paths.
One native rerun completed assertions but timed out during browser teardown;
it is not counted as a pass. The final isolated rerun passed all five with exit 0.
Ignored raw evidence lives in `output/reconciliation/` and
`output/ai-readiness-release/`; it is excluded from Hosting and Git.

## What remains distinct

The public release has guest tab-memory results. Opt-in account saving is prepared
and locally tested but not activated; its new permissions need explicit approval.
See [the concrete account release candidate](member-assessment-release-candidate.md).
The branch's later account modules and original course draft are preparation work,
not part of the live `4f95e06` source snapshot.

Brian chose save only when the member asks and retain until deletion. He also
requested original Ballers Kingdom courses informed by Justin Lester's public
offerings. The local private Kingdom AI Playbook draft contains
six original text lessons and a workbook; no paid Lester lessons were accessed
or copied. Its price and public/paid division are still unapproved. The draft is excluded
from the public GitHub repository and from Hosting. Checkout, merchant/tax mapping and protected paid delivery remain
inactive. One-time purchases were selected; memberships come later.

# Approved public Hosting cleanup

Released October 11, 2026 at **01:17:58.652 UTC** after Brian approved
preparing, testing and deploying a cleanup that preserves the working website.
The approval covers cleanup only. Assessment and commerce features remain held.

| Item | Exact value |
| --- | --- |
| Firebase project | `the-ballers-kingdom` (`78885961453`) |
| Hosting site | `ballkingdom-com` |
| Production URL | https://ballkingdom.com |
| Live version | `sites/ballkingdom-com/versions/4a80d522cc70cc38` |
| Release | `sites/ballkingdom-com/releases/1791681478652000` |
| Finalized clean rollback | `sites/ballkingdom-com/versions/87fe2cf57d72b0c5` |
| Prior version, unsafe to republish | `e33289aa8931f7ee` |

The release retains all **171 ordinary public file hashes**, removes **1,318
internal artifact paths**, adds zero paths and changes zero public hashes.
Every omitted path contains a hidden directory or filename component. The
exact live Hosting configuration is retained, including clean URLs, the HTML
fallback, JavaScript/CSS caching and private no-store workout headers.

The release reuses existing Hosting content hashes. No file body was uploaded.
No Functions, Auth, Firestore, Storage, IAM, credentials, grants, prices, other
Hosting sites, DNS or mail settings were changed. The production pages come
from the prior live version, not this branch's new assessment pages.

## Preparation and verification

`scripts/build-hosting-cleanup.mjs` constructs an omission-only manifest from
the pinned live snapshot. It rejects stale snapshots and other projects/sites.
It performs no network call, checkout asset overlay or publishing operation.

The payload SHA-256 is
`a0009c37ad8c2949d5e97cbbadd7494f618f2a4157a557c741262bdd9e5a4dc2`;
the exact configuration JSON SHA-256 is
`9e234dccf6706fb9093bd099fbf5bc3eb388dce2f7b9b0098386904743ae3b2a`.

168 retained files were matched to local source using Firebase's compressed
content hash. The three unmatched ordinary files were retained by their existing
hashes, without downloading their bodies: two reserved Firebase initialization
paths and `rebuild_form.gs`. Retention does not establish the script's privacy
or purpose; a separate source review remains necessary.

Checks completed for this cleanup:

- `node --test tests/*.test.mjs`: **112 passed**, zero failures or skips.
  Five cleanup-specific tests cover hash preservation, nested omissions, config
  preservation, stale baselines and target isolation. The new assertions first
  failed before the builder was added.
- `node node_modules/playwright/cli.js test --config tests/hosting-cleanup.config.mjs`:
  **12 passed** against exact live-matched local source.
- `BK_CLEANUP_LIVE=1 node node_modules/playwright/cli.js test --config tests/hosting-cleanup.config.mjs`:
  **12 passed** against production in fresh headless Chrome profiles.
- The browser checks cover six public/mobile pages, local service-guide open,
  answer and close, synthetic signed-out and owner workout views, private-field
  clearing on sign-out, synthetic sign-in failure/retry, and the existing Your
  Game assessment, Daily Game and Inner Game journey.
- Nine ordinary public pages/scripts fetched after release matched their
  retained Hosting hashes. Both `/workouts` and `/workouts.html` retained
  `no-store` headers.
- **36 HEAD-only checks passed**: six previously sampled internal paths across
  the apex, www and same site's web.app alias, with and without cache-busting.
  All returned `text/html`, not their former artifact types. The www requests
  followed only the canonical same-site redirect. No artifact body was read.
- Hosting metadata confirmed the finalized and active manifest has exactly
  171 unchanged public hashes and no omitted internal paths. Both finalized
  versions were verified independently. The site has only the live channel;
  there is no separate preview channel serving the previous release.

Synthetic workout runtimes replace Auth and backend operations. Cleanup browser
tests block non-read and third-party requests. Your Game tests use synthetic
local-device data. No real member record was read, no sign-in email sent, and no
assessment or payment was submitted to a third party. These tests do not claim
to verify real account authentication or private backend behavior.

Firebase did not expose `fileCount` statistics immediately after finalization.
The one-shot operator stopped before any public release, verified the exact
171-entry active manifest and config, then resumed without repeating the
rollback mutations. File-list verification is the evidence for the count.

## Safe rollback and future releases

The finalized rollback version contains the same sanitized 171-file manifest
and exact public configuration. It is not attached to a separate public channel.
Use this clean version or a reviewed fix-forward release if rollback is needed.
**Do not select an older console rollback:** that can restore the 1,318 exposed
artifact paths. Republishing a version remains an explicitly approved action.

Older releases remain in Hosting history. This cleanup does not delete history,
rotate credentials, establish whether an artifact contained secrets, or recall
previously downloaded/cached copies. Those are separate decisions if evidence
warrants them. Detailed artifact paths and operator state remain ignored local
evidence, excluded from Hosting and Git.

The new Base44 navigation/native assessment and purchase scaffolding are not
included. Draft PR #20 remains unmerged. Before any feature preview/release,
reconcile its baseline to this clean live version and revalidate authentication,
data-sharing, retention and commercial decisions. The older additive overlay's
artifact blocker is historical and must not be bypassed by reusing its manifest.

Official deployment procedure:
[Firebase Hosting REST API](https://firebase.google.com/docs/hosting/api-deploy),
[content registration](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.versions/populateFiles),
and [releases](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.releases/create).

Local ignored evidence is under `output/cleanup-only-release/`: `plan.json`,
`deployment-state.json`, `rollback-diagnostic.json`, `browser-{local,live}.json`,
`public-live-hash-checks.json`, `removed-exposure-head-checks.json` and
`channel-check.json`. Operator logs are under `output/reconciliation/`.

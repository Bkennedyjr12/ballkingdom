# Site refinement review package

This is an offline candidate. No deployment, provider write, payment, or message is performed by its builder.

The build reconciles the fresh read-only current Hosting file inventory, the historical approved member-release manifest, current main `17b3fc1`, and the new tools directory. Public source is taken from this review branch, preserving recovered member/workout/chat functionality alongside current marketing pages and the Gumroad Readiness link.

Run from the repository root with Node 22:

```sh
node scripts/build-site-preview.mjs ../live-hosting-snapshot.json
python3 -m http.server 4173 --directory output/site-preview
```

The default historical manifest is the sanitized, committed public-path manifest at `docs/operations/site-refinement-member-paths.json`. An alternative reviewed manifest can be supplied as the second argument. The builder does not retrieve remote data.

Generated outputs:

- `output/site-preview/`: only explicit public allowlisted files.
- `output/site-preview-report/classification.json`: baseline classifications, unknown paths, and missing files; emitted even when validation blocks copying.
- `output/site-preview-report/manifest.json`: sorted byte hashes and Firebase gzip hashes, source versions, configuration digest, and exclusions.
- `firebase.site-preview.json`: public target configuration points exclusively at the generated directory and retains the committed rewrites, cache headers, clean URLs, and trailing-slash policy. It contains no Functions, Rules, or redirect-site deployment.

Do not deploy the repository root. Historical Hosting inventories include seven internal `.superpowers` reports; these are excluded without reading their bodies. `CNAME`, `rebuild_form.gs`, and `workouts-preview.html` are also intentionally excluded. Firebase-reserved `/__/firebase/init.js` and `/__/firebase/init.json` remain platform-managed and are not copied. The classification report lists each source occurrence separately.

The builder refuses unknown baseline paths, missing source files, source paths escaping through symlinks, hidden paths, arbitrary source maps, and unreviewed preview/admin content. It clears only its own generated preview directory after input validation to prevent stale files surviving a rebuild. It does not copy documentation, tests, backend source, private originals, or credentials.

A candidate preview does not establish signed-in production assessment acceptance. The prior member release documented a remaining human save/reopen/delete check and App Check limitation. Preserve this distinction when reviewing restored application interfaces. Any production release still requires an exact public manifest/configuration review and separate deployment authorization.

## Verification and publication boundary

- Source checks: 119 passed, zero failures, including deterministic packaging and rejection of an unknown inherited file.
- Chrome regressions: 46 passed, including commerce synthetic flows, Your Game, storefront, inspection deep links, menu behavior and five responsive widths.
- Native guest assessment: five browser checks passed. This does not verify a real signed-in member save/delete.
- Independent review: three native specialist slices plus a real `ecoai ask --via claude` read-only public-code review. Addressed focus contrast, direct-fragment scrolling, availability copy, and remaining inspection promotion. Header proportions were retained after desktop/mobile inspection.
- Fresh production metadata: `f02056fd508e37c8`, 164 paths. Its seven internal dot paths are excluded from the candidate without reading their bodies. The public candidate contains 195 allowlisted files, including recovered app assets.
- The candidate restores the committed private/no-store headers for `/workouts` and `/workouts.html`, which are missing from the current live configuration. Other current rewrite, clean-URL and asset-cache behavior is retained. This is an intentional header restoration, not exact configuration parity.
- No Functions, Auth, Rules, IAM, DNS or payment-provider deployment is included. PR20's existing backend source is retained for repository continuity; do not deploy it through this work.
- Do not use the present live release as a rollback without sanitizing its internal paths. Before approved publication, prepare a clean rollback version from the reviewed current public file hashes and current configuration; retain the final version receipt and validate real served asset hashes after release.

Local public-only review: `http://127.0.0.1:4188/`. Source preview at 4187 is for development only. GitHub checks validate source/packaging; they do not publish. Production requires approval of this concrete candidate under the Firebase deploy-review skill.

## Approved publication reconciliation

Brian approved publication of the reviewed version. Preflight found newer main `280ad62` and live version `943fa628fc543b90`, containing Strategy Session checkout and additional Gumroad products. Those public pages, scripts and product links are preserved; the approved compact navigation remains. No concurrent backend code is redeployed. The reconciled candidate contains 199 public files; 121 Node22 source checks pass. Fresh regression and production receipts are retained locally under `output/approved-release/` and adjacent verification logs.

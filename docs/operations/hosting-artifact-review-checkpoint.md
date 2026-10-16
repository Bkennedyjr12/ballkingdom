# Hosting artifact and iOS handoff checkpoint

Historical checkpoint reviewed October 10, 2026. This narrow follow-up classified manifest metadata,
made six public HEAD-only requests, and checked Library upload availability.
No artifact body, secret, member record or paid document was fetched. No
production file, permission, Auth setting, rule, price or provider changed.

Brian subsequently approved a **cleanup-only** production release. It is live
as of October 11, 2026, with all 171 ordinary hashes preserved and 1,318 internal
paths removed. The assessment overlay was excluded. The release evidence and
safe rollback procedure are in [hosting-cleanup-release.md](hosting-cleanup-release.md).
The earlier 177-file overlay candidate below is historical and was never
published; it is not the approved or deployed manifest.

## Manifest classification

The pinned live snapshot contains 1,489 paths: 171 ordinary paths and 1,318
internal-looking paths. Of the latter, 1,311 belong to four embedded worktree
copies and seven are separate agent-state artifacts. Classification is based
on directory roles and file extensions, not inspected contents.

| Category | Paths |
| --- | ---: |
| Agent planning and state | 159 |
| Backend source, tests and configuration copies | 201 |
| Documentation and evidence copies | 171 |
| Root test copies | 22 |
| Site/guide project, page and asset copies | 590 |
| Root configuration, rules, metadata and cache | 39 |
| Other nested project artifacts | 136 |
| Total | 1,318 |

The extensions include 320 Markdown files, 288 JavaScript/module files, 89
HTML files, 83 JSON files, 82 review diffs, eight PDFs and four videos. There
are 566 distinct internal hashes. Exactly 445 paths have the same hash as a
locally verified ordinary live file; 873 do not. Duplication does not approve
publication, and filenames cannot establish that no embedded secrets or
private/paid content exists. The manifest does not provide per-file sizes.

## Reachability evidence

Six representative paths returned HTTP 200 without authentication. The
responses advertised content types consistent with backend JavaScript,
planning Markdown, a review diff, a public-media duplicate, a PDF and cache
metadata. None returned the site's HTML type. This is evidence that internal
artifacts are publicly reachable; the contents and confidentiality of those
artifacts remain unverified. No redirect was followed and no response body
was read. Detailed paths and response metadata remain local and ignored.

Seventy-five ordinary public HTML/CSS/JavaScript/configuration files were
checked from exact live-hash-matched local source. No literal internal-path
references were found. This is limited dependency evidence: it does not rule
out computed URLs, incoming links or external dependencies. The three
ordinary paths without a matching local source were not read.

## Minimal release decision

Do not approve carrying the 1,318 internal paths into a new release. The
existing additive overlay establishes compatibility only. Its generated
release plan now explicitly sets `publicationBlocked: true` with the
`inherited-internal-artifact-review` blocker. No cleanup option or publishing
operation has been added.

The recommended next decision is a separately approved, narrowly scoped
clean release that omits these internal artifacts while retaining every
ordinary live hash, the exact public Hosting configuration, and the ten
assessment/integration overlay paths. That would leave 177 paths before any
further reviewed exception or ordinary-file decision. Resolve the three
unmatched ordinary paths first; two are Firebase reserved initialization
paths and one is a script-like source artifact. No deletion manifest has
been approved or sent.

A concrete local candidate manifest and omission list were prepared under
ignored reconciliation output for operator review. They retain 167 ordinary
paths unchanged, include the ten public overlay changes, and propose omitting
1,318 internal paths. The candidate plan is explicitly blocked pending
approval, ordinary-source review and authenticated preview validation. It is
a proposal, performs no network call, and has not been sent to Hosting.

Review any claimed dependency or retention exception before publication.
Keep a later rollback from silently restoring the exposing file set. After
an approved clean preview/release, repeat bounded HEAD checks and inspect
public chat, workouts and assessment journeys. A removed path may return the
public HTML fallback under the existing SPA rewrite, so HTTP 200 alone is
not a sufficient post-cleanup failure criterion.

Firebase documents that `ignore` controls deployment selection and that
exact static files take precedence over rewrites. Changing an ignore list
alone does not remove the current deployed artifacts; a rewrite alone does
not hide retained exact-match files. See the official
[Hosting configuration guide](https://firebase.google.com/docs/hosting/full-config).
Firestore/Storage rules are not an access boundary for these static Hosting
artifacts. The proposed scope remains only `ballkingdom-com` in
`the-ballers-kingdom`; no other domain or service is included.

## Library recovery and iOS blocker

A harmless exact-title Library search succeeded. The unchanged current
upload helper nevertheless discovers an authenticated catalog containing
448 tool entries with no matching Library connector or upload-preparation
action. Its supported transport overrides are absent, so it uses its
documented default transport. This is a discovery/availability mismatch;
no authentication or automatic-approval rejection was returned.

One supported recovery attempt was made after the Library read. It failed
with the same unavailable-preparation error before any file was prepared,
transferred or finalized. Both upload result files are empty; no Library
identity or save is confirmed. The three public/synthetic mobile PNGs remain
local and have not been published elsewhere.

The current Library skill requires a prepared batch when both upload tools
are surfaced. Its referenced prepared-upload instructions state: “Never
switch a started helper write to a direct action.” This flow was not
bypassed, no helper was patched, and no endpoint or credential was invented.
The required next step is a runtime exposing the supported Library upload
route to its helper. Alternatively, a separately approved clean cloud
preview could provide iOS review after the artifact release decision. The
localhost preview is not an iOS deliverable.

Skill source:
[Library SKILL.md](skill://plugin_connector_1p_1b8ff8edfc1481918b252c8277e23125/library/SKILL.md)
and its referenced
[prepared-upload rules](skill://plugin_connector_1p_1b8ff8edfc1481918b252c8277e23125/library/references/prepared-uploads.md).

## Verification and scope

The new publication-block assertion failed before the guard was added, then
the root suite passed all 107 tests, including six overlay tests. Two fresh
builds produced identical payload/config/plan bytes. Public payload and
config digests are unchanged. Earlier clean browser results remain 49 root
and five native checks; the full Functions result remains 518 passed with
two explicit emulator skips. Only local build metadata and documentation
changed in this follow-up; no browser or deployed backend behavior changed.

Local evidence: `output/reconciliation/internal-artifact-classification.json`,
`internal-artifact-head-probe.json`,
`internal-artifact-public-dependency-check.json`,
`library-discovery-diagnostic.json`, `library-upload-recovery.err` and
`artifact-reviewed-overlay-digest-{first,second}.txt`. The separate proposed
cleanup metadata is `cleanup-candidate-plan.json`,
`cleanup-candidate-manifest.json` and `cleanup-candidate-deletions.json`.
These are ignored and
excluded from Hosting and contain no downloaded artifact bodies.

The member portal, commercial model, pricing, assessment retention, AI
provider and Base44 export decisions remain pending. No broader work was
started.

# Firebase commerce Rules source evidence

Status: **Sources recovered; merge, artifact mapping, and emulator proof remain blocked — do not map, deploy, or activate the commerce pilot**

Recorded: 2026-08-30 (America/Los_Angeles)

## Independently recovered deployed sources

An authorized read-only Firebase Rules API query on 2026-08-30 independently resolved the two current production releases. The query used the active `lilpelejr12@gmail.com` Google Cloud identity with project `the-ballers-kingdom`; it did not create a release, enable an API, or modify a rule.

| Release | Current Ruleset | Ruleset created | Recovered source | Exact source SHA-256 |
| --- | --- | --- | --- | --- |
| `projects/the-ballers-kingdom/releases/cloud.firestore` | `projects/the-ballers-kingdom/rulesets/2c9d612b-dd17-406f-9a0f-86230c57420c` | `2026-08-01T18:17:20.210799Z` | `firestore.rules`, 10,192 bytes | `0d700ff33ee25eb5032ce04308e30ffc91d04e5c3a548bf7118bb641c5ae94a5` |
| `projects/the-ballers-kingdom/releases/firebase.storage/the-ballers-kingdom.firebasestorage.app` | `projects/the-ballers-kingdom/rulesets/6a0d2e24-723d-4512-a4e1-7f2288550997` | `2026-07-25T16:21:33.435711Z` | `storage.rules`, 7,999 bytes | `fb9987658560321e9cb039f0d0bed04c581fe5abe83cba440cbabfac8a1f86ef` |

The release names also independently identify the active Storage Rules bucket as `the-ballers-kingdom.firebasestorage.app`. A read-only Cloud Storage listing confirmed that bucket exists in `US-WEST1` with uniform bucket-level access currently false. It contains one object under the existing `owners/` namespace and zero objects whose names match the proposed `private-commerce` prefix, the pilot SKU, study-guide terms, or PDF artifacts. No object contents were read.

The recovered deployed sources were hashed byte-for-byte from the API response. An exact-content comparison against every `firestore.rules` and `storage.rules` revision reachable from the local Git refs found no match, so no historical repository file is being substituted for the live source. The recovered source bodies were kept only in local temporary preflight files; this evidence retains their immutable Ruleset IDs, timestamps, sizes, and hashes without silently overwriting the reviewed local fragments.

## Verified repository state

- `firestore.rules` is a local commerce-only deny fragment. Its own header says it is not the authoritative production ruleset, and `firebase.json` intentionally has no `firestore.rules` mapping.
- `storage.rules` is a local commerce-only deny fragment created for static fail-closed verification. It is not an authoritative production ruleset, and `firebase.json` intentionally has no `storage` block.
- Both local fragments are excluded from every Hosting manifest entry.
- Firebase Admin operations would bypass these fragments; no browser or public-object access is authorized by this work.
- The fulfillment unit suite demonstrates the required atomic `consumeDownloadGrant` repository contract with an in-memory test double. There is no real Firestore transaction implementation or emulator proof in this task, so persistent single-use redemption is not claimed as complete.
- The artifact boundary is stream-only and rejects URL-shaped results. It remains intentionally unwired until the bucket and object placement are verified; no reusable signed or provider URL is produced.

The local-fragment hashes below identify only the reviewed repository artifacts. They are **not** production-source or merge evidence:

- local `firestore.rules`: `c33aa73684250b52184999a3da0abe1825a5286f65014ebf8287155d47c37504`
- local `storage.rules`: `c5b5a5dd70201822c901e439030b0491fec980424c40c97569c1c3141ddbedcc`

## Remaining missing evidence

The following evidence has not been recovered or independently verified:

1. The reviewed private-object prefix and object placement for each commerce SKU. No paid pilot artifact currently exists in the verified production bucket.
2. A reviewed merge of the narrow commerce denies into both recovered source bodies.
3. Merged policy hashes demonstrating that unrelated live policy was preserved.
4. Exact `firebase.json` Rules mappings to the reviewed merged files.
5. Auth, Firestore, Storage, and Functions emulator results against the merged policies.
6. A real persistent fulfillment adapter and atomic single-use grant implementation against the verified bucket and approved object mapping.

## Tooling gate

- `/usr/bin/java` exists only as the macOS launcher; `java -version` exits 1 with `Unable to locate a Java Runtime`.
- `@firebase/rules-unit-testing` is absent from `functions/node_modules`.
- No Java runtime or package was installed during this preflight.

## Release decision

No Rules mapping was added to `firebase.json`, no paid object path was guessed, and no Rules deployment or dry run was attempted. The deployed source recovery resolves the source-identity blocker only; it does not make the unmerged local fragments deployable. The digital fulfillment implementation accepts its SKU-to-object allowlist and object reader only as server-side dependencies, and the production runtime must remain unwired until the paid artifact is approved and placed, both live policies are merged and reviewed, and the emulator matrix passes.

The production commerce pilot remains blocked even if application unit tests pass. The safe next sequence is: preserve the recovered source bodies in a reviewed source-control change; approve the exact pilot artifact and private object key; merge the commerce denies without deleting existing policy; review the resulting hashes and mappings; install Java and the Rules SDK under separate approval; pass the complete emulator matrix; and only then request separate scoped dry-run and deployment approvals.

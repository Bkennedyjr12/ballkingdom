# Firebase commerce Rules source evidence

Status: **Byte-exact originals retained and separate local merge candidates prepared; unmapped, emulator-unverified, artifact-absent, and not release-ready**

Recorded: 2026-08-30 (America/Los_Angeles)

## Independently recovered deployed sources

An authorized read-only Firebase Rules API query on 2026-08-30 independently resolved the two current production releases. The query used the active `lilpelejr12@gmail.com` Google Cloud identity with project `the-ballers-kingdom`; it did not create a release, enable an API, or modify a rule.

| Release | Current Ruleset | Ruleset created | Recovered source | Exact source SHA-256 |
| --- | --- | --- | --- | --- |
| `projects/the-ballers-kingdom/releases/cloud.firestore` | `projects/the-ballers-kingdom/rulesets/2c9d612b-dd17-406f-9a0f-86230c57420c` | `2026-08-01T18:17:20.210799Z` | `firestore.rules`, 10,192 bytes | `0d700ff33ee25eb5032ce04308e30ffc91d04e5c3a548bf7118bb641c5ae94a5` |
| `projects/the-ballers-kingdom/releases/firebase.storage/the-ballers-kingdom.firebasestorage.app` | `projects/the-ballers-kingdom/rulesets/6a0d2e24-723d-4512-a4e1-7f2288550997` | `2026-07-25T16:21:33.435711Z` | `storage.rules`, 7,999 bytes | `fb9987658560321e9cb039f0d0bed04c581fe5abe83cba440cbabfac8a1f86ef` |

The release names also independently identify the active Storage Rules bucket as `the-ballers-kingdom.firebasestorage.app`. A read-only Cloud Storage listing confirmed that bucket exists in `US-WEST1` with uniform bucket-level access currently false. It contains one object under the existing `owners/` namespace and zero objects whose names match the proposed `private-commerce` prefix, the pilot SKU, study-guide terms, or PDF artifacts. No object contents were read.

The deployed originals were hashed byte-for-byte from the API response and retained without modification under [`docs/operations/evidence/firebase-rules/`](evidence/firebase-rules/). The adjacent [`provenance-manifest.json`](evidence/firebase-rules/provenance-manifest.json) records the immutable release/Ruleset names, retrieval method, immediate matching release readback, and every source filename, size, hash, and retained path. Each Ruleset currently has exactly one source file. The retained `source-projection.json` files cover the complete `.source` object rather than assuming `files[0]`; their canonical hashes exclude only documented non-source server metadata. If a later readback contains more files, every file must be retained before the evidence can pass. The paginated metadata-only bucket evidence is retained separately in [`storage-object-inventory.json`](evidence/firebase-rules/storage-object-inventory.json); its sole private object name is hashed, not disclosed. Bucket-resource facts and their field-filtered response are in [`bucket-metadata-attestation.json`](evidence/firebase-rules/bucket-metadata-attestation.json) and contain no IAM or object names. An exact-content comparison against every `firestore.rules` and `storage.rules` revision reachable from the local Git refs found no match, so no historical repository file is being substituted for the live source. The retained originals are evidence inputs only; they do not overwrite the reviewed local fragments and are not mapped for deployment.

## Verified repository state

- `firestore.rules` is a local commerce-only deny fragment. Its own header says it is not the authoritative production ruleset, and `firebase.json` intentionally has no `firestore.rules` mapping.
- `storage.rules` is a local commerce-only deny fragment created for static fail-closed verification. It is not an authoritative production ruleset, and `firebase.json` intentionally has no `storage` block.
- Both local fragments are excluded from every Hosting manifest entry.
- Firebase Admin operations would bypass these fragments; no browser or public-object access is authorized by this work.
- The fulfillment service boundary is stream-only and rejects URL-shaped results. It remains intentionally inactive because the verified bucket contains no approved paid artifact; no reusable signed or provider URL is produced.
- A Firestore fulfillment repository now implements digest-only grant creation and atomic consumption using Firestore transactions. A serialized, Firestore-shaped fake proves the transaction contract locally, including concurrent replay denial and issuing a new grant after a consumed streaming failure. This is not Rules-emulator or live-persistence proof.
- An Admin Storage adapter now verifies the exact recovered bucket name, private prefix, object generation, MIME, and size; reselects the immutable generation; validates CRC32C during streaming; counts actual bytes; and streams directly to a server response. Disconnect, overflow, truncation, or metadata mismatch destroys the stream and fails closed. It never calls or returns a signed URL. Runtime readiness remains hard-coded false and the active artifact allowlist remains empty because the retained inventory proves no paid artifact exists.

The local-fragment hashes below identify only the reviewed repository artifacts. They are **not** production-source or merge evidence:

- local `firestore.rules`: `c33aa73684250b52184999a3da0abe1825a5286f65014ebf8287155d47c37504`
- local `storage.rules`: `c5b5a5dd70201822c901e439030b0491fec980424c40c97569c1c3141ddbedcc`

## Separate local merge candidates

The immutable deployed originals remain unchanged. Separate candidates and stable unified diffs are retained under [`docs/operations/evidence/firebase-rules/merge-candidates/`](evidence/firebase-rules/merge-candidates/). Removing each single marked commerce block produces a byte-exact copy of its deployed original; automated tests enforce that property.

| Candidate | Added policy | Candidate SHA-256 | Diff SHA-256 |
| --- | --- | --- | --- |
| Firestore | Explicit direct-client deny matches for all commerce collections, including fulfillment and refund-review state | `78138d8cd5ffd417c932c670bc2327c33886a43c4c880c7de6a3ba33d056f122` | `ba7119afb613fbbe1f382e394d4334f9e41ae1b12478dc0fac0533d3d45625f1` |
| Storage | Explicit direct-client deny for `private-commerce/{artifact=**}` | `5d5bc0155f2f2c2a39b0b837714903e4337a0868ec0997375ad4e14d36e03de8` | `7a44c367595dca82e37e8842839259cdc68485ae20abba3d08e2dd76727e8757` |

[`manifest.json`](evidence/firebase-rules/merge-candidates/manifest.json) records source Ruleset identities, source hashes, candidate sizes/hashes, diff sizes/hashes, the verified bucket, and the inactive release boundary. These files are candidates only: root fragments and `firebase.json` mappings were not changed.

## Remaining missing evidence

The following evidence has not been recovered or independently verified:

1. The reviewed private-object prefix and object placement for each commerce SKU. No paid pilot artifact currently exists in the verified production bucket.
2. Independent review acceptance of the two local merge candidates.
3. Exact `firebase.json` Rules mappings to reviewed candidates, under separate release approval.
4. Auth, Firestore, Storage, and Functions emulator results against the candidates.
5. An approved paid artifact, exact private object key, verified metadata, and post-placement inventory evidence.

## Tooling gate

- `/usr/bin/java` exists only as the macOS launcher; `java -version` exits 1 with `Unable to locate a Java Runtime`.
- `@firebase/rules-unit-testing` is absent from `functions/node_modules`.
- No Java runtime or package was installed during this preflight.

## Release decision

No Rules mapping was added to `firebase.json`, no paid object path was guessed, and no Rules deployment or dry run was attempted. The candidate files do not replace the repository-root fragments. The fulfillment runtime readiness state is false with zero active artifacts, so the new Firestore and Admin Storage adapters cannot create a customer-facing delivery path.

The production commerce pilot remains blocked even if application unit tests pass. The safe next sequence is: independently review the candidates; approve and place the exact pilot artifact and private key; retain verified object metadata; install Java and the Rules SDK under separate approval; pass the complete emulator matrix; review explicit mappings; and only then request separate scoped dry-run and deployment approvals.

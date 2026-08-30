# Firebase commerce Rules source evidence

Status: **Blocked — do not map, deploy, or activate the commerce pilot**

Recorded: 2026-08-30 (America/Los_Angeles)

## Verified repository state

- `firestore.rules` is a local commerce-only deny fragment. Its own header says it is not the authoritative production ruleset, and `firebase.json` intentionally has no `firestore.rules` mapping.
- `storage.rules` is a local commerce-only deny fragment created for static fail-closed verification. It is not an authoritative production ruleset, and `firebase.json` intentionally has no `storage` block.
- Both local fragments are excluded from every Hosting manifest entry.
- Firebase Admin operations would bypass these fragments; no browser or public-object access is authorized by this work.

The local-fragment hashes below identify only the reviewed repository artifacts. They are **not** production-source or merge evidence:

- local `firestore.rules`: `c33aa73684250b52184999a3da0abe1825a5286f65014ebf8287155d47c37504`
- local `storage.rules`: `c5b5a5dd70201822c901e439030b0491fec980424c40c97569c1c3141ddbedcc`

## Missing authoritative evidence

The following evidence has not been recovered or independently verified:

1. The source location and identity of the complete production Firestore Rules policy.
2. The pre-merge SHA-256 of that production Firestore policy.
3. The source location and identity of the complete production Storage Rules policy.
4. The pre-merge SHA-256 of that production Storage policy.
5. The exact production Storage bucket used for paid artifacts.
6. The reviewed private-object prefix and object placement for each commerce SKU.
7. Merged policy hashes demonstrating that unrelated live policy was preserved.
8. Auth, Firestore, Storage, and Functions emulator results against the merged policies.

## Release decision

No Rules mapping was added to `firebase.json`, no bucket or object path was guessed, and no Rules deployment was attempted. The digital fulfillment implementation accepts its SKU-to-object allowlist and object reader only as server-side dependencies; the production runtime does not construct either dependency until the authoritative bucket and policy evidence above is recovered.

The production commerce pilot remains blocked even if application unit tests pass. Recovery must be read-only first, followed by hash capture, policy merge and review, explicit `firebase.json` mappings, Java/rules-unit-testing emulator proof, and a separately approved scoped release.

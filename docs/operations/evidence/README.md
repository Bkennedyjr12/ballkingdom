# Commerce preflight evidence checksums

Recorded: 2026-08-30T22:49:03Z

These artifacts are sanitized, read-only preflight evidence. They authorize no deployment, provider configuration, secret access, outbound effect, or pilot activation.

| Artifact | SHA-256 method | SHA-256 |
| --- | --- | --- |
| `firebase-rules/firestore/2c9d612b-dd17-406f-9a0f-86230c57420c/firestore.rules` | exact retained bytes | `0d700ff33ee25eb5032ce04308e30ffc91d04e5c3a548bf7118bb641c5ae94a5` |
| `firebase-rules/storage/6a0d2e24-723d-4512-a4e1-7f2288550997/storage.rules` | exact retained bytes | `fb9987658560321e9cb039f0d0bed04c581fe5abe83cba440cbabfac8a1f86ef` |
| `firebase-rules/provenance-manifest.json` | file bytes | `7005816ccffb0a6cd3db8bf38f736e8f45b05b3be499def0977f06c5216a849b` |
| `firebase-rules/storage-object-inventory.json` | file bytes | `200ea0822c31d94f0e7745a8fa13bc37e3753960d0e34169e8bfe9dd931a7296` |
| `firebase-rules/firebase-target-attestation.json` | file bytes | `9a513be278260632bc526808cbd0fbd0379ac07ee52d31976613a73897853ff2` |
| `intuit-production-app-observation.json` | file bytes | `2d861594dcc1ccc44f24f0d9d263aaa044cf5d719f69d0e843ee8c998bd4ad15` |
| `intuit-production-app-observation.json` | canonical JSON from `jq -cS .` plus LF | `f93c3264d76cad6065f83d1d6ef22190421633d3a80c22ad226744cb78b49937` |

The canonical structured Intuit observation hash covers only the observation artifact. It does not hash or imply access to any Intuit credential, key, token, OAuth grant, or company entity.

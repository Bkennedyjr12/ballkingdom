# Commerce preflight evidence checksums

Initialized: 2026-08-30T22:49:03Z

Last updated: 2026-08-30T23:34:41Z

These artifacts are sanitized, read-only preflight evidence. They authorize no deployment, provider configuration, secret access, outbound effect, or pilot activation.

| Artifact | SHA-256 method | SHA-256 |
| --- | --- | --- |
| `firebase-rules/firestore/2c9d612b-dd17-406f-9a0f-86230c57420c/firestore.rules` | exact retained bytes | `0d700ff33ee25eb5032ce04308e30ffc91d04e5c3a548bf7118bb641c5ae94a5` |
| `firebase-rules/storage/6a0d2e24-723d-4512-a4e1-7f2288550997/storage.rules` | exact retained bytes | `fb9987658560321e9cb039f0d0bed04c581fe5abe83cba440cbabfac8a1f86ef` |
| `firebase-rules/provenance-manifest.json` | file bytes | `70c02375d785f529aa5d63db6a54bbfe4fa29d4a4370a9c8691dbbd9f3bb3100` |
| `firebase-rules/firestore/2c9d612b-dd17-406f-9a0f-86230c57420c/source-projection.json` | file bytes | `a93f9390ea22d6eba1c8d4c422e2a8bac0dc1b921867c99d9cfb88f2f8bd5172` |
| Firestore complete `.source` projection | canonical JSON from `jq -cS '{source:.source}'` plus LF | `3a0dd7432c26fd8ecafe0d9f48bcd8b49956ae2d57dfe701bd314f1c286483b5` |
| `firebase-rules/storage/6a0d2e24-723d-4512-a4e1-7f2288550997/source-projection.json` | file bytes | `fcd88d6bea6ec01309c1c5e39fd588ab3cbaee1d81d1d9444d61101e0d0a54c9` |
| Storage complete `.source` projection | canonical JSON from `jq -cS '{source:.source}'` plus LF | `828a26842313d88f6903d418ab3304fae0fdd574f8a4645e86f0166307d8c851` |
| `firebase-rules/bucket-metadata-response.json` | file bytes | `95c1a393948a3158104952cf888873fb1721be6452ea09ec4d0962a2537fb6ac` |
| Bucket metadata field-filtered response | canonical JSON from `jq -cS .` plus LF | `8a27cc5a33407270bc0c7cb06461c60391555933accee378b8a1f4d156805a58` |
| `firebase-rules/bucket-metadata-attestation.json` | file bytes | `79762eb3d40424e34cd732ced3ca53a4c85f60320712948fe3b10c206ac53019` |
| `firebase-rules/storage-object-inventory.json` | file bytes | `200ea0822c31d94f0e7745a8fa13bc37e3753960d0e34169e8bfe9dd931a7296` |
| `firebase-rules/firebase-target-attestation.json` | file bytes | `9a513be278260632bc526808cbd0fbd0379ac07ee52d31976613a73897853ff2` |
| `intuit-production-app-observation.json` | file bytes | `2d861594dcc1ccc44f24f0d9d263aaa044cf5d719f69d0e843ee8c998bd4ad15` |
| `intuit-production-app-observation.json` | canonical JSON from `jq -cS .` plus LF | `f93c3264d76cad6065f83d1d6ef22190421633d3a80c22ad226744cb78b49937` |
| `qbo-production-accounting-health-observation.json` | file bytes | `c0c6b106a23ebf5fb8d1f352a5c7725d07cdb0c55a784c81ef99811ca810c213` |
| `qbo-production-accounting-health-observation.json` | canonical JSON from `jq -cS .` plus LF | `b8f0bfee68a2e0b505ecdbd07a3d5663cc834d8a02cac8fb78db66dee5202e9d` |

The canonical structured observation hashes cover only their sanitized observation artifacts. They do not contain or hash any Intuit credential, key, token, realm identifier, OAuth grant, or provider response payload.

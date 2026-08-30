# QuickBooks commerce Task 12 preflight

Status: **HOLD — byte-exact deployed Rules originals retained; no production release or pilot action is authorized**

Recorded: 2026-08-30 (America/Los_Angeles)

Current-state addendum: the Rules blockers recorded by this earlier preflight were subsequently resolved locally. Accepted commit `c17d3b5` maps byte-exact reviewed derivatives at the repository roots; Java 21 and the Rules SDK are installed; and the root-based Firestore/Storage authorization matrix passes 10/10. Nothing was deployed. The paid artifact remains absent, fulfillment runtime remains `ready:false`, and production release remains on hold.

## Scope and zero-effect boundary

This preflight used only local repository/history inspection and authorized read-only Firebase Rules, Firebase target, Google Cloud, and Cloud Storage metadata/listing operations. It performed no Firebase deploy or dry run, package or Java installation, secret access or creation, Auth/provider change, webhook change, email, invoice, customer/item/payment/refund creation, production QuickBooks entity read, push, or merge.

## Blockers resolved

1. **Firebase identity and target resolution:** explicit project/account readback resolved `the-ballers-kingdom` under `lilpelejr12@gmail.com`, default Firestore database `(default)`, Hosting target `public -> ballkingdom-com`, and inspector target `inspector -> the-ballers-kingdom`.
2. **Intuit production app visibility:** workspace `The Ballers Kingdom` contains app `TBK Q.B A.I` marked `IN PRODUCTION`.
3. **Webhook state observed:** the Production Webhooks endpoint is empty (length 0) and Save is disabled. No key/token was viewed and no setting changed. Webhooks remain optional acceleration and separately approval-gated; scheduled reconciliation remains mandatory.
4. **Deployed Firestore original retained:** live release `cloud.firestore` points to Ruleset `2c9d612b-dd17-406f-9a0f-86230c57420c`, created `2026-08-01T18:17:20.210799Z`; its unmodified 10,192-byte `firestore.rules` is retained with SHA-256 `0d700ff33ee25eb5032ce04308e30ffc91d04e5c3a548bf7118bb641c5ae94a5`.
5. **Deployed Storage original and bucket retained:** live release `firebase.storage/the-ballers-kingdom.firebasestorage.app` points to Ruleset `6a0d2e24-723d-4512-a4e1-7f2288550997`, created `2026-07-25T16:21:33.435711Z`; its unmodified 7,999-byte `storage.rules` is retained with SHA-256 `fb9987658560321e9cb039f0d0bed04c581fe5abe83cba440cbabfac8a1f86ef`. The production bucket is `the-ballers-kingdom.firebasestorage.app` in `US-WEST1`.
6. **Historical production Accounting read:** an approved read-only check at `2026-08-30T23:30:50Z` loaded the four existing QBO secret values only into process memory, received HTTP `200` from the OAuth refresh POST and HTTP `200` from Accounting CompanyInfo, and read back exact CompanyName `The Ballers Kingdom`. The provider rotated the refresh credential, but the test intentionally retained no payload and therefore did not persist it. A subsequent use of the deployment-pinned stored credential failed. Brian then approved the exact OAuth reconnect; the existing callback completed with `QuickBooks connected` and added enabled version 3 for `QBO_REFRESH_TOKEN` and `QBO_REALM_ID`, without changing an Accounting record. No secret value is retained here.

Each current Ruleset reports `sourceFileCount: 1`; the complete retained `.source` projections enumerate every filename and content rather than assuming array index zero. The Firestore projection canonical SHA-256 is `3a0dd7432c26fd8ecafe0d9f48bcd8b49956ae2d57dfe701bd314f1c286483b5`; the Storage projection canonical SHA-256 is `828a26842313d88f6903d418ab3304fae0fdd574f8a4645e86f0166307d8c851`. Immediate release readback remained byte-identical.

The separate bucket metadata response confirms name `the-ballers-kingdom.firebasestorage.app`, location `US-WEST1`, metageneration `1`, and uniform bucket-level access disabled. Bucket resources have no object-style generation field; `lockedTime` is absent because UBLA is disabled. Its canonical field-filtered response SHA-256 is `8a27cc5a33407270bc0c7cb06461c60391555933accee378b8a1f4d156805a58`, and no IAM, member, customer, or object-name field was requested.

Durable evidence paths and checksums are indexed in [`docs/operations/evidence/README.md`](evidence/README.md). The structured Intuit app observation's canonical JSON SHA-256 is `f93c3264d76cad6065f83d1d6ef22190421633d3a80c22ad226744cb78b49937`; the corrected production Accounting chronology's canonical JSON SHA-256 is `b8f0bfee68a2e0b505ecdbd07a3d5663cc834d8a02cac8fb78db66dee5202e9d`.

## Historical blockers at preflight time

1. **Resolved locally after this preflight:** the retained originals were merged with narrow commerce denies, accepted, mapped, and emulator-tested. They remain undeployed.
2. The verified bucket contains no paid pilot artifact or reviewed `private-commerce`/per-SKU object placement. The repository has a local `home-inspection-guide/public/assets/guide.pdf`, but local presence is not authority to publish or select it as the paid artifact.
3. **Resolved locally after this preflight:** Java 21 and `@firebase/rules-unit-testing` are installed, and the root Rules authorization matrix passed. This is not deployment proof.
4. The persistent production fulfillment adapter and atomic grant consumption remain intentionally unwired pending the approved object mapping and Rules proof.
5. Continuing production Accounting health is blocked by `rotating_token_persistence_runtime_fix_unreviewed_undeployed`. The current adapter discards future rotated refresh credentials, and `defineSecret` binding remains deployment-version-pinned. No fresh health read was attempted after reconnect; it must wait until safe persistence is implemented, reviewed, and deployed.
6. Intuit sandbox, refund/reversal authoritative readback, supported dependency disposition, scoped Firebase dry runs/deploys, recipient secret creation, Auth provider configuration, feature-flag activation, and every outbound/pilot effect remain pending under their existing separate gates. The first dated CompanyInfo read and reconnect are not sandbox or entity-write proof.
7. Secret versions 1 and 2 for both reconnected secret names remain enabled. No value was accessed. Retention/disablement requires a separate version-lifecycle review after safe rotation persistence and rollback requirements are established.

## Exact safe next actions and approvals

1. **Completed locally, undeployed:** the recovered bodies, narrow merges, independent diff review, exact root hashes, mappings, and emulator evidence are retained.
2. Brian must approve the exact paid SKU artifact and its private object key before any upload. After that separate approval, upload once, independently read back object metadata/hash, and wire the allowlist only to that verified object.
3. **Completed locally:** Java 21 and the Rules test SDK are installed and the mapped root authorization matrix passes. Persistent live fulfillment remains intentionally inactive pending artifact evidence.
4. Finish and review the rotating-refresh-credential persistence implementation. Prove it writes a new Secret Manager version without logging or persisting a credential elsewhere, handles failure safely, and cannot silently continue on a stale deployment-pinned version. Do not deploy it under this evidence task.
5. After that runtime fix is reviewed and separately deployed, run one fresh approved read-only health check and retain only statuses and exact company-name match. Then review the enabled old-version lifecycle separately; do not disable versions merely to make the inventory look clean.
6. After the source, artifact, dependency, emulator, and Accounting-health blockers are resolved, request separate approvals for each production-target dry run and each scoped Rules/Functions/Hosting deployment. Keep both commerce flags false through the fail-closed release proof.
7. Treat recipient-secret creation, Firebase email-link provider configuration, one exact-recipient Graph authentication email, one QuickBooks invoice send, one owner-controlled payment, settlement verification, and any refund as distinct later approvals. The historical health check, reconnect, app visibility, and webhook access authorize none of them.

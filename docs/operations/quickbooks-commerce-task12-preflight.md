# QuickBooks commerce Task 12 preflight

Status: **HOLD — byte-exact deployed Rules originals retained; no production release or pilot action is authorized**

Recorded: 2026-08-30 (America/Los_Angeles)

## Scope and zero-effect boundary

This preflight used only local repository/history inspection and authorized read-only Firebase Rules, Firebase target, Google Cloud, and Cloud Storage metadata/listing operations. It performed no Firebase deploy or dry run, package or Java installation, secret access or creation, Auth/provider change, webhook change, email, invoice, customer/item/payment/refund creation, production QuickBooks entity read, push, or merge.

## Blockers resolved

1. **Firebase identity and target resolution:** explicit project/account readback resolved `the-ballers-kingdom` under `lilpelejr12@gmail.com`, default Firestore database `(default)`, Hosting target `public -> ballkingdom-com`, and inspector target `inspector -> the-ballers-kingdom`.
2. **Intuit production app visibility:** workspace `The Ballers Kingdom` contains app `TBK Q.B A.I` marked `IN PRODUCTION`.
3. **Webhook state observed:** the Production Webhooks endpoint is empty (length 0) and Save is disabled. No key/token was viewed and no setting changed. Webhooks remain optional acceleration and separately approval-gated; scheduled reconciliation remains mandatory.
4. **Deployed Firestore original retained:** live release `cloud.firestore` points to Ruleset `2c9d612b-dd17-406f-9a0f-86230c57420c`, created `2026-08-01T18:17:20.210799Z`; its unmodified 10,192-byte `firestore.rules` is retained with SHA-256 `0d700ff33ee25eb5032ce04308e30ffc91d04e5c3a548bf7118bb641c5ae94a5`.
5. **Deployed Storage original and bucket retained:** live release `firebase.storage/the-ballers-kingdom.firebasestorage.app` points to Ruleset `6a0d2e24-723d-4512-a4e1-7f2288550997`, created `2026-07-25T16:21:33.435711Z`; its unmodified 7,999-byte `storage.rules` is retained with SHA-256 `fb9987658560321e9cb039f0d0bed04c581fe5abe83cba440cbabfac8a1f86ef`. The production bucket is `the-ballers-kingdom.firebasestorage.app` in `US-WEST1`.

Each current Ruleset reports `sourceFileCount: 1`; the complete retained `.source` projections enumerate every filename and content rather than assuming array index zero. The Firestore projection canonical SHA-256 is `3a0dd7432c26fd8ecafe0d9f48bcd8b49956ae2d57dfe701bd314f1c286483b5`; the Storage projection canonical SHA-256 is `828a26842313d88f6903d418ab3304fae0fdd574f8a4645e86f0166307d8c851`. Immediate release readback remained byte-identical.

The separate bucket metadata response confirms name `the-ballers-kingdom.firebasestorage.app`, location `US-WEST1`, metageneration `1`, and uniform bucket-level access disabled. Bucket resources have no object-style generation field; `lockedTime` is absent because UBLA is disabled. Its canonical field-filtered response SHA-256 is `8a27cc5a33407270bc0c7cb06461c60391555933accee378b8a1f4d156805a58`, and no IAM, member, customer, or object-name field was requested.

Durable evidence paths and checksums are indexed in [`docs/operations/evidence/README.md`](evidence/README.md). The structured Intuit observation's canonical JSON SHA-256 is `f93c3264d76cad6065f83d1d6ef22190421633d3a80c22ad226744cb78b49937`.

## Blockers remaining

1. The retained deployed originals are not yet merged with the narrow commerce denies, independently reviewed as merged policies, or mapped in `firebase.json`. The current root-level tracked rules remain local fragments and must not be deployed.
2. The verified bucket contains no paid pilot artifact or reviewed `private-commerce`/per-SKU object placement. The repository has a local `home-inspection-guide/public/assets/guide.pdf`, but local presence is not authority to publish or select it as the paid artifact.
3. Java is unavailable (`java -version` exits 1), `@firebase/rules-unit-testing` is absent, and the complete Auth/Firestore/Storage/Functions emulator matrix has not run.
4. The persistent production fulfillment adapter and atomic grant consumption remain intentionally unwired pending the approved object mapping and Rules proof.
5. No existing safe command/test was found that performs an independently verified, no-secret, no-mutation production Accounting OAuth read. The current Accounting connection therefore remains unverified in this preflight. No secret was accessed and no QuickBooks entity was read to manufacture that proof.
6. Intuit sandbox, refund/reversal authoritative readback, supported dependency disposition, scoped Firebase dry runs/deploys, recipient secret creation, Auth provider configuration, feature-flag activation, and every outbound/pilot effect remain pending under their existing separate gates.

## Exact safe next actions and approvals

1. In a reviewed source commit, preserve the two recovered live Rules source bodies under their recorded Ruleset IDs/hashes, merge only the commerce denies, and add exact mappings only after independent diff review confirms all unrelated live policy remains. This is source work, not deployment authorization.
2. Brian must approve the exact paid SKU artifact and its private object key before any upload. After that separate approval, upload once, independently read back object metadata/hash, and wire the allowlist only to that verified object.
3. Obtain approval to install a supported Java runtime and `@firebase/rules-unit-testing`; then run the full local emulator matrix against the merged policies and persistent fulfillment adapter.
4. Add or approve a narrowly scoped production Accounting health check that performs one read-only company/realm query through the existing OAuth boundary, logs no token or private entity data, and creates nothing. Run it only after a separate credential-using production-read approval.
5. After the source, artifact, OAuth, dependency, and emulator blockers are resolved, request separate approvals for each production-target dry run and each scoped Rules/Functions/Hosting deployment. Keep both commerce flags false through the fail-closed release proof.
6. Treat recipient-secret creation, Firebase email-link provider configuration, one exact-recipient Graph authentication email, one QuickBooks invoice send, one owner-controlled payment, settlement verification, and any refund as distinct later approvals. App visibility and webhook access authorize none of them.

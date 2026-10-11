# Private content ingestion scaffold

Brian requested incorporating today's forthcoming uploads into the Firebase
platform. No source materials have arrived. This change supplies a local,
default-disabled server contract and synthetic tests; it invents no content,
product, license permission, price or entitlement.

`functions/src/learning/private-content-service.js` is not imported or exported
by Functions `index.js`. No UI upload endpoint, Storage adapter, signed URL,
Firestore adapter, role issuance, provider integration or deployment is included.
The [approved production cleanup](hosting-cleanup-release.md) is separate and
contains none of this scaffold.

## Metadata and lifecycle

Each owner-scoped source record contains:

- Title and `course`, `guide` or `resource` type.
- Source author and private source reference for attribution.
- Asserted ownership status and license reference. An owner's claim does not
  count as verified rights; a separate reviewer decision records evidence,
  ownership/license status, reviewer identity and public/paid permission.
- Explicit `private`, `public` or `paid` audience. Paid content requires a
  server-approved one-time product mapped to the exact source and content version.
- Bounded upload declarations: original basename, media type, byte count and
  SHA-256. The current conservative limit is 25 MiB. Active HTML/SVG/scripts
  are excluded. Actual materials may require a reviewed format/size adjustment.
- Server-owned `draft`, `review` or `published` state, immutable raw object
  generation, reviewed derivative identity, and timestamps.

The implemented contract is:

1. `prepareDraft`: verified content manager + App Check creates draft metadata
   and a private authenticated upload plan. It returns no upload/download URL
   and performs no Storage upload. Caller ownership, status, path, price and
   entitlement fields are rejected.
2. `submitForReview`: a trusted storage-inspection adapter must establish that
   the exact private raw object exists, matches the declared bytes/type/hash,
   has a pinned generation and has passed scanning. Caller claims cannot replace
   this verification.
3. `review`: a verified reviewer records license evidence and whether public or
   paid distribution is allowed. Restricted/unverified rights cannot publish.
4. `publish`: a separate trusted release adapter supplies a reviewed private
   derivative. A raw source object cannot become a release artifact. Paid
   publication additionally requires the approved one-time product/version.
5. `authorizeDelivery`: an internal server streaming authorization checks
   published status and rights on every request. Private derivatives are owner
   only; public derivatives can be read without sign-in after rights review;
   paid derivatives require verified sign-in/App Check and a current server
   entitlement for the exact buyer/product/version. Revoked grants, retired
   products and unpublished content deny future access.
6. `reopenDraft`: atomically clears the publication and license approval,
   preventing further delivery until review and publication occur again.

## Storage and authorization boundaries

Proposed raw path: `private-learning/{ownerUid}/sources/{sourceId}/raw`.
Proposed derivative path:
`private-learning/{ownerUid}/releases/{sourceId}/{contentVersion}/artifact`.
The service chooses both paths. Original filenames never form an object path.
Both namespaces are private Storage objects, never public Hosting files.
Even a public resource uses only its reviewed derivative through the proposed
server delivery boundary; raw uploads and private source references stay private.

Future `authenticateRequest` must derive UID, valid App Check, content-manager
and reviewer capabilities from trusted server verification. They are injected
contract fields, not newly issued Firebase claims or permission grants. Map
Brian's existing identity deliberately before enabling anything; never infer a
role from a browser email or request flag.

Future metadata persistence must be owner-scoped, create-only for new IDs, and
transactional for `updateForOwner`. Clients must not write publication, review,
artifact or entitlement fields. The actual Storage bucket, live rules, scanning
pipeline and delivery adapter still require review. Existing rules were not
edited or deployed, and no direct client access is claimed. The current source
rules have a deny-by-default catch-all; live enforcement remains unverified.

`authorizeDelivery` returns a bounded artifact descriptor **only to a trusted
server adapter**. Do not serialize it as a browser API response, issue public or
Firebase token URLs, or accept a browser-selected object key. The future stream
must recheck access, use the pinned generation/type/size/hash and no-store headers.
Reuse the existing protected guide delivery and grant patterns where applicable,
after resolving the commerce audit's payment/reversal gaps. No assessment or
workout data belongs in invoices or third-party ingestion/recommendation calls.

## Validation and remaining inputs

The 14 new synthetic service tests first failed before implementation. Additional
corrupt-state and provider-error boundary tests exposed two failures, then passed
after hardening. Final command:
`node --test functions/test/private-content-service.test.mjs` — **14 passed**.
Full Functions Node 22 suite: **534 total, 532 passed, zero failures, two explicit
Firestore/Storage emulator skips**. No live upload, permission, rule enforcement,
real Auth, real entitlement or source-content review is claimed.

Reviewed materials must arrive before content entry. For each item, confirm its
author/source, ownership or license evidence, intended format/type, public versus
paid audience, and approved product/version if paid. Raw uploads must remain in
the private intake area while attribution, redaction, scanning and derivative
review are completed. Grant or permission expansion and publication still need
their own approval. No content was sent to an AI provider.

Brian approved **one-time course/guide purchases for the first release**, with
memberships later. This service rejects membership publication. Specific products,
prices, tax treatment, merchant evidence and live buyer access are not established
by that direction. See [the commerce source audit](firebase-learning-commerce-roadmap.md).

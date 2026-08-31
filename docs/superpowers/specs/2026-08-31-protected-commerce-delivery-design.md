# Protected Commerce Delivery Design

Date: 2026-08-31

Status: Approved in chat; written specification awaiting final review

## Objective

Complete the missing Firebase browser and protected-download runtime for the Ballers Kingdom
Home Inspection Study Guide. A verified buyer must be able to authenticate, request a
single-use download grant, and receive the exact private PDF only after the existing server
state proves the order is fulfilled. The design does not activate invoicing, send a message,
create an order, or make a tax determination.

## Existing foundation

The repository already contains:

- a server-priced, default-off QuickBooks invoice flow;
- Firebase email-link generation and the approved Microsoft Graph delivery adapter;
- server-side order ownership and payment-state checks;
- Firestore grant/entitlement persistence with atomic, single-use consumption;
- private artifact metadata validation and generation-pinned Storage streaming;
- an order-status interface and mocked browser journey for grant redemption.

The missing production pieces are the Firebase browser runtime, callable grant endpoint,
authenticated streaming endpoint, and their connection to the existing page. The verified
artifact is generation `1788191152627469` at
`private-commerce/home-inspection-study-guide/guide-v1.pdf` in
`the-ballers-kingdom.firebasestorage.app`.

## Chosen architecture

### Browser runtime

Add one focused ES module that initializes the existing Ballers Kingdom Firebase Web App
from its public SDK configuration, initializes App Check with the production-approved
reCAPTCHA Enterprise provider, and initializes Firebase Authentication. Public Firebase
configuration and the public reCAPTCHA site key are configuration identifiers, not secrets;
they must still be retrieved from the authoritative Firebase project and must never be
invented.

The runtime exposes only these operations to the commerce client:

- `getAppCheckToken()` for ordinary callable requests;
- `getLimitedUseAppCheckToken()` for the replay-protected stream request;
- `getIdToken()` for the current authenticated user;
- `completeEmailLink({email})` using `isSignInWithEmailLink()` and
  `signInWithEmailLink()` against the current HTTPS URL.

The email address is never accepted from a URL parameter. The user must enter the same
address that received the link. The runtime clears Firebase action parameters from browser
history after successful completion so the consumed one-time code does not remain visible
or get reused. Invalid, expired, modified, or reused links leave the user signed out and
return no provider detail.

### Grant creation

Export `createDownloadGrant` as a second-generation Firebase callable with App Check
enforcement. It requires a verified Firebase ID token and passes only the authenticated UID,
App Check context, and bounded `orderHandle` into the existing fulfillment service. The
service re-reads the order and entitlement, proves exact ownership and fulfilled status, and
stores only a SHA-256 digest of a cryptographically random 32-byte grant. The raw 43-character
base64url grant is returned once with its ten-minute expiration and is never logged or stored.

### Grant redemption and streaming

Export `redeemDownloadGrant` as a second-generation HTTPS function because callable
responses cannot stream a binary PDF. It accepts only `POST` and an exact JSON request body
containing `orderHandle` and `grant`. It requires:

- `Authorization: Bearer <Firebase ID token>` verified by Firebase Admin Auth;
- `X-Firebase-AppCheck: <limited-use token>` verified and consumed by Firebase Admin App
  Check with replay protection;
- an `Origin` on the explicit production allowlist (`https://ballkingdom.com` and the
  reviewed Firebase Hosting site used for release verification).

Preflight permits only `POST`, `Content-Type`, `Authorization`, and `X-Firebase-AppCheck`.
Responses never reflect arbitrary origins, permit credentials, or expose provider errors.
All authorization and grant checks complete before response headers or artifact bytes begin.

The existing transaction consumes the grant atomically before streaming. The server then
re-reads the generation-pinned object metadata and requires the exact bucket, key,
generation, MIME type, byte length, and MD5. It streams the object through the function with
Storage MD5 validation and verifies the exact byte count. It sets:

- `Content-Type: application/pdf`;
- `Content-Disposition: attachment; filename="Home Inspection Study Guide.pdf"`;
- `Cache-Control: private, no-store, max-age=0`;
- `X-Content-Type-Options: nosniff`;
- no public or signed Storage URL.

If validation or streaming fails, the one-time grant remains consumed. The fulfilled order
and entitlement remain intact, allowing the owner to request a fresh grant. This favors
confidentiality and replay resistance over resuming a partially transferred file.

### Browser download behavior

The commerce boundary calls the grant callable, keeps the raw grant only in a local variable,
then immediately calls the streaming endpoint with fresh ID and limited-use App Check tokens.
It requires an HTTP 200 response, exact PDF content type, and a bounded nonempty body before
creating a temporary object URL and programmatically downloading
`Home Inspection Study Guide.pdf`. The object URL is revoked and all raw grant references are
cleared in `finally`. No grant, token, action code, object path, or provider identifier is
written to local storage, session storage, the URL, analytics, or console output.

## Failure and privacy contract

- Signed-out, wrong-user, disabled/revoked-user, wrong-order, unfulfilled, expired-grant,
  replayed-grant, invalid App Check, and wrong-origin requests fail closed.
- Public responses use a small generic status vocabulary and do not reveal whether an order,
  entitlement, or grant exists.
- Direct Storage Rules continue denying every `private-commerce/**` read.
- The browser cannot supply price, SKU mapping, object path, generation, checksum, tax code,
  customer UID, or fulfillment state.
- Logs and audit receipts contain only bounded event names, safe error classes, timestamps,
  and opaque order identifiers where already permitted; they contain no tokens, grant,
  email action link, full email address, or Storage URL.
- No message or QuickBooks mutation occurs in either download endpoint.

## Release gates

Implementation and release proceed test-first through a feature branch and PR. Before any
production deployment:

1. Retrieve and read back the exact Firebase Web App configuration and App Check provider
   registration from project `the-ballers-kingdom` without exposing credential-bearing CLI
   output.
2. Prove email-link completion, ID-token retrieval, ordinary App Check, and limited-use App
   Check with injected browser tests and Firebase emulators where supported.
3. Prove the callable and stream endpoint contracts, CORS allowlist, replay protection,
   ownership, grant consumption, metadata pinning, interrupted streaming, and generic errors.
4. Run the complete storefront, browser, Functions, Rules/emulator, syntax, dependency, and
   repository-security gates.
5. Merge the reviewed PR before scoped Functions and Hosting deployments.
6. Independently verify live Function state, headers, unauthenticated denial, direct Storage
   denial, and exact object metadata.

The catalog remains `active: false`, `tax.accountantVerified: false`, and both commerce
environment flags remain `false` during this release. Enabling the digital invoice pilot,
sending an authentication email, creating/sending a QuickBooks invoice, making a payment,
or issuing a refund each remains a separate action-time approval. Professional confirmation
of the electronic-only California `NON` tax mapping is required before activation.

## Testing matrix

Automated coverage must include:

- Firebase runtime unavailable, App Check unavailable, signed out, and invalid email link;
- successful same-address email-link completion and action-parameter removal;
- missing, malformed, expired, replayed, and wrong-owner grants;
- disabled/revoked/stale authenticated users;
- wrong method, content type, origin, ID token, and App Check token;
- replayed limited-use App Check token;
- order not fulfilled and entitlement mismatch;
- wrong bucket, key, generation, content type, size, MD5, truncated stream, oversized stream,
  and response disconnect;
- successful exact PDF stream with safe headers;
- browser grant kept in memory for one attempt, temporary object URL revoked, and no token or
  private field added to the URL or persisted storage;
- inactive catalog and false/false runtime flags after release.

## Authoritative references

- [Firebase email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Firebase App Check for custom web backends](https://firebase.google.com/docs/app-check/web/custom-resource)
- [Verify App Check tokens in a custom backend](https://firebase.google.com/docs/app-check/custom-resource-backend)
- [Firebase Web App Check API](https://firebase.google.com/docs/reference/js/app-check)
- [Firebase Admin ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

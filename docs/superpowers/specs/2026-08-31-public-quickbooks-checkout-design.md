# Public QuickBooks Checkout Design

Date: 2026-08-31
Status: Approved design
Owner: Brian Kennedy Jr. / The Ballers Kingdom

## Objective

Make the $49 Home Inspection Study Guide available to public customers through the existing
Firebase and QuickBooks commerce system. Customers verify their email, receive a QuickBooks
invoice, pay with a method QuickBooks presents (including card, Apple Pay, and PayPal/Venmo when
available),
and receive the existing protected PDF only after exact Accounting evidence verifies payment.

This release expands the reviewed owner-only pilot. It does not create a standalone PayPal
integration, collect payment credentials, activate unrelated products, or change the legacy
service-invoice workflow.

## Approved business decisions

- Public customers may purchase without a geographic restriction.
- The electronic-only PDF uses QuickBooks tax code `NON` nationwide.
- Brian reports that a qualified accountant confirmed the California treatment. Current CDTFA
  Publication 109 also says electronically transmitted digital products are generally not taxable
  when no printed copy or physical storage medium is supplied.
- The accountant confirmation directly covers California. Applying `NON` outside California is
  an owner-approved business risk and must be revisited if product format, nexus, or applicable law
  changes.
- The product remains electronic-only. No printed copy, flash drive, disc, or other tangible copy
  is included in the sale.
- Two automated transactional messages are authorized for this checkout only: the Firebase
  sign-in link delivered through Microsoft Graph from `info@ballkingdom.com`, and the customer
  invoice delivered by QuickBooks. Marketing messages and unrelated outbound mail remain outside
  scope.
- Apple Pay must be offered through the QuickBooks e-invoice rather than through a standalone
  Apple Pay integration. The QuickBooks card-payment option and online invoice delivery must be
  enabled, and invoice surcharging must be off because Intuit disables Apple Pay on surcharged
  invoices.
- The first real transaction is a controlled owner purchase before general promotion.

## Customer journey

1. The customer opens the Home Inspection Study Guide checkout and sees the server-returned
   product name, $49 price, electronic-delivery terms, refund link, and QuickBooks payment notice.
2. The customer enters a name and email address and requests a sign-in link.
3. Firebase App Check, server-side validation, rate limits, and abuse controls evaluate the
   request. The public response is generic regardless of whether delivery proceeds.
4. The server generates a Firebase email sign-in link and Microsoft Graph sends the approved
   transactional template from `info@ballkingdom.com`.
5. Firebase Auth completes the link with in-memory persistence. The server re-verifies the ID
   token with revocation checking, re-reads the authoritative user, and uses the verified email as
   the customer identity. Browser-supplied UID or replacement email values are never authoritative.
6. The system transactionally reserves one active order for the verified customer and SKU,
   creates or reuses the matching QuickBooks customer, creates one server-priced invoice using
   item ID `8` and tax code `NON`, and asks QuickBooks to send it once.
7. QuickBooks presents the payment methods enabled for the invoice. This includes Apple Pay when
   the customer opens the e-invoice in Safari on an Apple Pay-configured iPhone, iPad, or Mac with
   an eligible card. Ballers Kingdom never receives card, bank, Apple Pay, PayPal, or Venmo
   credentials.
8. QuickBooks webhooks are hints only. Scheduled reconciliation and explicit status checks
   independently re-fetch the authoritative Invoice and Payment evidence.
9. Only an exact realm, invoice, customer, amount, currency, item, and payment match marks the
   order fulfilled.
10. The authenticated owner requests a short-lived grant. Redemption consumes a limited-use App
    Check token and the single-use grant, rechecks identity and ownership, and streams the exact
    generation-pinned private PDF.

## Public identity and email delivery

The existing single-recipient Secret Manager allowlist is removed from the public digital-product
path. It remains untouched for any unrelated pilot or service workflow that still needs it.

Public sign-in accepts a normalized email address only after App Check. Email-link requests use:

- exact input schemas and bounded field lengths;
- per-IP and per-email-digest limits plus one App Check app-global breaker;
- no claim that Firebase App Check `appId` is a device or installation identifier;
- generic public responses and redacted internal errors;
- transactional claims so parallel requests produce at most one send;
- bounded sequential reissue for lost or expired links;
- durable recipient/SKU/purpose manual-review quarantine after ambiguous post-dispatch failures,
  independent of issuance windows and removable only by an authenticated administrator action.

The public browser never receives the Firebase action link from the server response. It is sent
only through the approved Graph mailbox. Link completion is separate from order creation so a
returning customer can safely resume an existing order without creating another invoice.

## Order and invoice invariants

- Product configuration, price, currency, QuickBooks item, tax code, and artifact identity are
  server-owned.
- A verified email/customer and SKU may have only one active unpaid or fulfilled order. A retry
  returns or resumes that order rather than creating a second invoice.
- Order reservation, effect claims, and recovery metadata are transactional and deterministic.
- QuickBooks create and send operations use stable business idempotency bindings.
- Invoice payment options enable card payments and online invoice delivery, keep surcharging off,
  and preserve the account's enabled PayPal/Venmo and ACH options. Apple Pay is a QuickBooks-managed
  card-wallet presentation, not a separate provider mutation or ledger.
- A timeout after a potentially committed provider action is ambiguous. The system quarantines it
  for manual review and never automatically repeats the provider mutation.
- Customer-visible status contains no provider identifiers, invoice internals, secrets, or private
  object path.
- Refund requests remain authenticated, bounded, and staged for human review. No automatic refund
  is introduced by this launch.

## Tax and geographic handling

The checkout does not block any billing location. The Home Inspection Study Guide remains
configured as an electronic-only digital product with QuickBooks tax code `NON`.

The release evidence must record:

- Brian's report of qualified-accountant confirmation for California;
- the current CDTFA Publication 109 source and access date;
- the owner decision to apply `NON` nationwide without geographic restriction;
- the condition that no tangible copy is included; and
- the residual requirement to reassess other-state obligations as nexus, sales volume, product
  format, or law changes.

The website must not claim that every digital product is universally tax exempt. Customer-facing
copy should state the charged total returned by QuickBooks and direct tax questions to the seller.

## Abuse, privacy, and operational controls

- App Check enforcement remains enabled on public callable Functions.
- Firebase Auth uses in-memory persistence; application code stores no ID token, App Check token,
  action link, or grant in local/session storage or URLs beyond Firebase's required one-time link.
- Logs and audit receipts store digests and normalized operational fields, not raw tokens, payment
  credentials, action links, or private download URLs.
- Public request and status endpoints have separate rate limits. Limits are enforced before
  expensive provider work where possible.
- A deployment-time emergency switch can disable public digital ordering without disabling order
  status or paid-customer fulfillment.
- Existing Hosting exclusions, private Storage denial, exact-origin CORS, request size bounds,
  generation/checksum validation, stream deadlines, and browser memory bounds remain unchanged.
- The runtime service account retains only the already approved App Check token-verifier binding;
  no new broad IAM role is introduced.

## Configuration and activation

Activation requires all authoritative catalog gates to be true for this SKU:

- `active:true`
- `tax.classificationApproved:true`
- `tax.accountantVerified:true`
- `tax.quickBooksTaxCode:'NON'`
- verified QuickBooks item ID/name
- verified immutable private artifact metadata
- `release.ownerPilotApproved:true`
- `release.priceApproved:true`
- `release.fulfillmentRuntimeVerified:true`
- `release.deployApproved:true`

`COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED` is replaced or renamed with a clearly scoped public
digital-commerce flag. The unrelated `COMMERCE_SERVICE_QBO_SEND_ENABLED` flag stays `false`.
Turning on the public flag is a separately reviewed production release step after the controlled
owner transaction passes. Configuration must fail closed if any gate is absent or malformed.

## Error handling and recovery

- Invalid or unknown emails receive the same public acknowledgement as accepted requests.
- Revoked, disabled, deleted, stale, or mismatched Firebase identities fail closed.
- Duplicate, parallel, and retried requests resume existing state.
- Pre-dispatch expired leases may be safely reclaimed; post-dispatch ambiguity becomes manual
  review.
- Unpaid, cancelled, refunded, partially refunded, mismatched, or unavailable Accounting evidence
  never grants fulfillment.
- A failed or interrupted PDF stream consumes the grant; the signed-in customer deliberately
  requests a fresh bounded grant. The browser never retries automatically.
- Operational alerts contain stable error codes and no customer or provider secrets.

## Testing and release verification

Implementation follows test-driven development and must add coverage for:

- public emails outside the former allowlist;
- malformed and abusive requests;
- per-IP, per-email, and independently reachable App Check app-global volume limits;
- one-send behavior under parallel sign-in requests and bounded reissue;
- public Auth completion, returning-order resumption, and inactive/revoked identities;
- one active order/invoice per verified customer and SKU;
- exact $49, item ID `8`, `NON`, and electronic-only invoice construction;
- signed-in QuickBooks account and representative e-invoice evidence that card payments, online
  invoice delivery, and Apple Pay are available with surcharging off;
- provider timeouts, ambiguous-send quarantine, and deterministic recovery;
- exact Accounting payment verification before fulfillment;
- protected grant and PDF streaming controls;
- customer-visible copy, refund terms, and no payment-credential collection;
- both activation and emergency-disable paths;
- Firestore/Storage emulator rules and Hosting package exclusions.

Release uses a clean worktree, independent code/security review, normal PR/CI merge, an explicit
Firebase project/account, an exact Functions allowlist, and Hosting target `public` only. The first
production proof is a controlled owner purchase with separate action-time approval for the actual
transaction. Readbacks must confirm function identities, flags, catalog gates, invoice mapping,
payment evidence, protected delivery, headers, private-object denial, and zero duplicate sends.

## Rollback

The pre-activation merge commit and exact prior Functions allowlist are recorded before deployment.
Rollback disables the public digital-commerce flag first, preserving status and fulfillment for
already-paid customers. If code rollback is required, deploy the reviewed prior Functions and
Hosting from a clean detached worktree using explicit project/account flags. Function deletion,
refunds, invoice voids, and customer communication remain separate destructive or outbound actions
requiring action-time approval.

## Explicit non-goals

- No standalone Apple Pay, PayPal, or Venmo API.
- No website collection of payment credentials.
- No activation of the SBA toolkit, career blueprint, human services, or unrelated products.
- No change to legacy service invoicing or booking confirmations.
- No physical guide or tangible delivery.
- No automatic refunds or invoice voids.
- No marketing email, mailing-list enrollment, or unrelated customer communication.

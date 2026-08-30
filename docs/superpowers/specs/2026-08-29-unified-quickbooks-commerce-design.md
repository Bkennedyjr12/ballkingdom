# Unified QuickBooks Commerce Design

**Status:** Invoice-path revision approved by Brian Kennedy Jr. on 2026-08-30; production implementation and every external write remain separately approval-gated.

## Goal

Give Ballers Kingdom customers one consistent purchase experience while keeping QuickBooks Online as the financial and payment system of record.

- Digital products create and automatically send one server-priced QuickBooks payable invoice, then remain locked until Accounting API evidence proves the exact invoice was paid.
- Scheduled and custom services may later use the same payable-invoice and payment-verification boundary, but retain Brian's existing approval gate and current Graph/PDF delivery path until the separately approved service migration is enabled.
- QuickBooks Payments presents and processes the enabled customer methods. Cards and PayPal/Venmo are confirmed active in the signed-in company; Ballers Kingdom will not build a separate PayPal API, ledger, or reconciliation pipeline.
- Ballers Kingdom never collects card, bank, PayPal, or Venmo credentials and never invents a QuickBooks payment-session or hosted-checkout API.

## Current State and Verified Boundary

The production Firebase integration is connected to the correct QuickBooks Online company and its existing Accounting API adapter can create customers and invoices. On 2026-08-30, an authorized read-only QuickBooks check confirmed that QuickBooks Payments is active and that Cards and PayPal/Venmo are enabled. The account displayed `2.9% + $0.25` for invoiced card and PayPal/Venmo transactions and `1% / max $20` for ACH. These are account-screen observations, not public-price estimates or guarantees about future pricing; ACH is a customer option only when QuickBooks exposes it on the particular invoice.

The existing adapter does not yet implement the documented Accounting API invoice-send operation, authoritative Invoice/Payment reads for commerce, webhooks, or commerce reconciliation. The currently signed-in Intuit Developer dashboard shows no app. Therefore the identity that owns or can configure the existing production Accounting OAuth app is not established, and production webhook configuration remains blocked.

This design uses only the existing `com.intuit.quickbooks.accounting` boundary. The current official Accounting API documents Invoice creation, reading, and sending and the Payment entity used to represent customer payments applied to invoices: [Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice), [Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment). No QuickBooks Payments API endpoint, direct wallet endpoint, browser pay URL, or payment-session response is required.

No invoice, email, payment, refund, account change, provider configuration, or deployment is authorized by this design revision. Automatic digital invoice send remains code-only until the separately approved pilot.

## Customer Experience

### Shared entry and order summary

Every sellable product or service uses the same Ballers Kingdom order-summary component. It shows the item, server-returned price or approved quote, customer details, fulfillment terms, refund/cancellation link, and the next action. The browser never receives Intuit credentials, never submits a payment amount as authority, and never decides whether an order is paid.

### Digital products

1. The customer selects an active product, supplies the minimum required name and email address, and completes Firebase email-link authentication. The callable requires a valid Firebase ID token with a verified email plus App Check; App Check alone is never customer authorization.
2. Firebase creates an immutable server-priced order in the already-defined `pending_payment` state and stores the authenticated `request.auth.uid` as `customerUid` before any invoice effect is claimable. It takes the customer email from the verified token, not from a browser assertion.
3. A durable order effect creates or recovers one QuickBooks customer and one invoice through the existing Accounting adapter. The stable Ballers Kingdom order reference and deterministic Accounting request ID prevent a retry from creating another invoice.
4. A separate leased effect invokes QuickBooks' documented invoice-send operation once. A successful API response records that QuickBooks accepted the send operation; it is not payment proof and is not represented as guaranteed inbox delivery. An expired send claim with an ambiguous outcome moves to `manual_review` and is never blindly resent.
5. The website displays `QuickBooks sent payment instructions to your email. Payment verification is pending.` Its status callable requires the same authenticated `customerUid` plus App Check; the opaque order handle is routing data, not a bearer credential, and exposes no provider pay URL.
6. QuickBooks presents and processes the payment methods enabled for the invoice, including PayPal/Venmo and, only when QuickBooks exposes it on that invoice, ACH.
7. Firebase re-fetches authoritative Invoice and linked Payment entities, then verifies the exact realm, invoice ID, immutable order reference, Invoice `TotalAmt` and `Balance`, Invoice deletion/void/payment status, Payment `TotalAmt` and `UnappliedAmt`, Payment deletion/void/status, currency, and exactly one full application to the expected Invoice.
8. Only that exact evidence produces the internal Task 3 `completed` result, moves the order once to `paid`, and triggers protected fulfillment. Partial, split, multi-invoice, unapplied, over-, under-, deleted, voided, reversed, wrong-realm, or mismatched evidence moves to `manual_review` or remains locked.

A browser return, website assertion, invoice creation response, invoice-send response, email screenshot, customer claim, webhook payload, or zero balance without the matching Payment evidence is never payment proof.

### Scheduled and custom services

1. An accepted booking or approved quote creates an operational service order in `pending_invoice_approval`.
2. Brian's existing authenticated administrator gate remains the only path that may claim invoice creation and send.
3. While `COMMERCE_SERVICE_QBO_SEND_ENABLED` is false, approval continues to use the current Microsoft Graph/PDF behavior unchanged. A separately approved service migration may enable idempotent QuickBooks invoice creation and the documented invoice-send operation; only then does Graph remain for operational messages rather than a second invoice email.
4. When the service migration flag is enabled, QuickBooks presents the payment methods enabled for that invoice.
5. When the service migration flag is enabled, the same Accounting evidence verifier reconciles the service order from authoritative Invoice and Payment entities; while it is false, current service behavior remains unchanged.

## Architecture

### Public website

The existing static Firebase Hosting site gains a shared purchase/order-summary module, Firebase email-link sign-in, and an order-status page. Ballers Kingdom collects contact details only. Payment credentials and payment-method selection remain on QuickBooks-controlled invoice surfaces reached from the QuickBooks email, not from a website-supplied URL.

### Firebase Functions

The isolated `ballkingdom-integrations` Functions codebase uses six narrow components:

- `commerceCatalog`: existing server-authoritative SKUs, prices, currency, and fulfillment types.
- `orderService`: existing explicit state machine plus transactional orders, effect claims, and audit receipts.
- `quickBooksAccounting`: the existing adapter for customers, items, invoice creation, the documented invoice-send operation, Invoice/Payment reads, and documented change-data capture.
- `quickbooks-payment-verifier`: provider-payload-neutral policy that accepts only normalized Accounting evidence and produces the exact shape required by the existing `validatePaymentResult()` contract.
- `paymentReconciler`: scheduled recovery and webhook-triggered re-fetch for nonterminal orders.
- `commerceFeatureFlags`: two independent, default-false gates for the digital invoice pilot and later service-invoice migration.

Raw Accounting responses stay inside the adapter. The verifier receives normalized values only, and the rest of the application stores opaque QuickBooks identifiers rather than provider payloads.

### Invoice send boundary

Invoice creation and invoice sending are separate durable effects:

1. A Firestore transaction claims invoice creation.
2. The Accounting adapter creates the invoice with a deterministic request ID or recovers the previously created invoice by its exact Ballers Kingdom order reference.
3. Firestore stores the immutable QuickBooks invoice ID before send is attempted.
4. A second transaction claims invoice send with a unique claim ID, `claimedAt`, and a five-minute `leaseExpiresAt`.
5. A confirmed send response completes that exact claim. The scheduled recovery worker may close a confirmed claim but never reissues an ambiguous send. Any expired send claim that could have crossed the provider boundary becomes `manual_review` with `invoice_send_unknown`; operators must reconcile it before any separately approved resend.

This avoids duplicate invoices and minimizes duplicate customer email risk without claiming impossible cross-system atomicity. The implementation must pin the exact request and response to the current official [Invoice documentation](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice); if the documented operation differs from an assumed path or field, the documentation wins.

### Payment verification boundary

The Accounting adapter normalizes authoritative entities into:

```json
{
  "realmId": "opaque-realm",
  "invoice": {
    "invoiceId": "opaque-invoice",
    "providerOrderRef": "bk-order-order-id",
    "totalAmountCents": 4900,
    "balanceCents": 0,
    "currency": "USD",
    "entityState": "present",
    "paymentState": "paid"
  },
  "payments": [
    {
      "providerPaymentRef": "opaque-payment",
      "entityState": "present",
      "totalAmountCents": 4900,
      "unappliedAmountCents": 0,
      "applications": [
        {"linkedTxnId": "opaque-invoice", "linkedTxnType": "Invoice", "amountCents": 4900}
      ]
    }
  ]
}
```

This is an internal normalized contract, not a claim that Intuit returns these field names. The adapter maps the Invoice `TotalAmt`, `Balance`, documented status/deletion/void semantics, and the Payment `TotalAmt`, `UnappliedAmt`, status/deletion/void semantics, line `Amount`, and `LinkedTxn` identifiers/types from the current official [Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice) and [Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment) contracts. `entityState` and `paymentState` are explicit normalized enums, not an invented `active` Boolean: any missing, unknown, deleted, voided, reversed, or partially paid state fails closed. For the first digital-product release, exactly one present Payment must have `TotalAmt` equal the expected amount, `UnappliedAmt` zero, and one application of that full amount to only the expected Invoice. Split, partial, overpaid, unapplied, or multi-invoice evidence remains locked for manual review. Only after every check passes does the verifier construct `{realmId, amountCents, currency, providerOrderRef, providerPaymentRef, status:'completed'}` for the existing `validatePaymentResult()` function; `completed` is never copied or unconditionally assigned from an Intuit response.

### Webhook hints and scheduled truth

When the owning Intuit Developer app becomes accessible, an HTTPS endpoint may receive documented QuickBooks Online webhooks for Invoice and Payment changes. It validates Intuit's signature over the unmodified request body before parsing, rejects the wrong realm, stores only normalized entity IDs/operations, and schedules reconciliation. It never transitions an order from webhook payload data. The worker re-fetches the named Accounting entities and runs the same verifier. See Intuit's current [webhooks documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) and [webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices).

Scheduled reconciliation is mandatory whether or not webhooks are configured. It queries due nonterminal orders, re-reads their Invoice, and discovers changed Invoice/Payment entities through the documented Accounting change-data-capture operation before fetching exact entities. Change data capture is a polling aid, not payment truth; the current [official Intuit Developer Accounting collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4) documents its bounded look-back behavior.

### Firestore records

`orders/{orderId}` retains the normalized model established by completed Tasks 1–4:

```json
{
  "sku": "home-inspection-study-guide",
  "orderType": "digital_product",
  "customerUid": "firebase-auth-uid",
  "customer": {"name": "Customer Name", "email": "customer@example.com"},
  "amountCents": 4900,
  "currency": "USD",
  "status": "pending_payment",
  "provider": "quickbooks",
  "providerRefs": {
    "realmId": "opaque-realm",
    "invoiceId": "opaque-invoice",
    "providerOrderRef": "bk-order-order-id"
  },
  "fulfillment": {"status": "locked"},
  "createdAt": "server timestamp"
}
```

Provider references are opaque identifiers. No provider URL, token, signature, raw webhook body, raw Invoice/Payment object, or payment credential enters Firestore. Append-only audit receipts record state/effect transitions without full customer or provider payloads.

### Secrets and authorization

- Existing OAuth credentials and refresh tokens remain in Google Secret Manager.
- The existing Accounting OAuth scope remains `com.intuit.quickbooks.accounting`; this design does not add a Payments API scope.
- QuickBooks connection and administrative operations require Firebase Authentication, App Check, and the `admin: true` custom claim.
- The first digital pilot requires Firebase email-link authentication. `createDigitalOrder` accepts only a verified-email Firebase identity, derives `customerUid` and email from `request.auth`, and writes that immutable owner mapping before invoice creation. A client-supplied UID/email or non-secret order handle never grants access.
- Enabling the Firebase email-link provider is configuration only and does not authorize an email. Calling Firebase's documented `sendSignInLinkToEmail` operation is a separate outbound email action requiring approval for that authentication email and its exact recipient. The later QuickBooks Invoice send/customer email and its recipient require a second, independent approval even when both emails use the same address. See Firebase's current [email-link authentication documentation](https://firebase.google.com/docs/auth/web/email-link-auth).
- `getOrderStatus`, `createDownloadGrant`, and grant redemption require App Check and `request.auth.uid === order.customerUid`. Administrator support uses the separate `admin:true` path and writes an audit receipt.
- A download grant contains a 256-bit random nonce, stores only its SHA-256 digest, binds to one order/customer/SKU, expires after ten minutes, and is consumed transactionally once. Concurrent or replayed redemption, expiry, wrong UID, wrong order, and path substitution fail closed. The authenticated redemption Function streams the allowlisted object; Storage is not directly readable and no reusable public signed URL is returned.
- The webhook verifier token remains in Secret Manager and is bound only if app ownership is established and webhook configuration is separately approved.
- Webhook requests require signature verification, replay-safe event handling, and strict realm matching.
- Logs redact access tokens, refresh tokens, webhook signatures, verifier tokens, payment details, customer content, and provider response bodies.

### Independent rollout flags

- `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED` defaults to `false` and gates digital order creation plus automatic invoice create/send. Status access for existing orders and recovery remain available while the flag is off.
- `COMMERCE_SERVICE_QBO_SEND_ENABLED` defaults to `false` and gates only the later service migration. When false, the existing approved service Graph/PDF path is unchanged.
- Both non-secret Boolean parameter values are sourced from the committed `functions/.env.the-ballers-kingdom`, which initially contains `false` for both flags and is narrowly unignored in `functions/.gitignore`. Firebase documents that parameter values are read from `.env.<project_ID>` during deployment and that the project file may be version-controlled: [parameterized Functions configuration](https://firebase.google.com/docs/functions/config-env), [`defineBoolean` reference](https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.params#defineboolean). No secret may enter this file.
- An approved digital activation is a reviewed commit changing only `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=true` while retaining `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`. The Firebase CLI must report loading the project file and must not prompt for either flag; an unexpected prompt aborts the deployment. An App Check- and admin-protected `getCommerceReleaseState` callable returns only the two runtime Booleans for post-deploy readback, which is paired with a digital-path smoke check and proof that the service path remains unchanged.
- Task 12 may enable only the digital flag for the one-SKU pilot. Enabling the service flag requires a separate approval, release, and service-flow verification after the digital pilot.

## State and Idempotency

The completed order-state contract remains:

`created -> pending_payment -> payment_verifying -> paid -> fulfilling -> fulfilled`

Service orders additionally use:

`pending_invoice_approval -> invoice_processing -> invoiced -> payment_verifying`

Terminal exception states are `cancelled`, `refunded`, and `manual_review`. Invoice-create and invoice-send effects are tracked separately from order status so a digital order can remain `pending_payment` while its invoice is prepared and sent.

Every state change and external effect uses a stable key derived from the Ballers Kingdom order ID. Firestore transactions claim invoice creation, invoice send, payment verification, status email, fulfillment, and refund reconciliation once. Each outbound claim has a unique claim ID and bounded lease. A stale deterministic invoice-create claim may recover by exact order reference/request ID before retry; a stale invoice-send claim is ambiguous and moves to `manual_review`, never to a blind resend. A scheduled reconciler recovers expired claims and checks every due nonterminal order so unavailable, delayed, or missed webhooks cannot strand a paid customer.

## Error Handling and Customer Safety

- Invoice creation failure leaves the order unpaid and fulfillment locked.
- Confirmed invoice creation plus failed send exposes no pay URL; the order remains locked for safe retry or manual review.
- An ambiguous send result does not cause a blind second email.
- A confirmed send response permits only `payment verification pending`; it never grants access.
- Realm, invoice, order-reference, amount, currency, balance, payment-linkage, duplicate, partial, split, deleted, or voided mismatches move to `manual_review` and do not fulfill.
- A fulfillment failure after verified payment preserves `paid`, retries safely, and alerts the administrator without creating another invoice or charge.
- Refunds require an authenticated administrator, a bounded reason, separate approval for the external QuickBooks action, authoritative Accounting read-back, and reconciliation before `refunded`.
- Public errors contain no provider payloads, credentials, stack traces, accounting details, or payment information.

## Accounting Rules

- QuickBooks is authoritative for customers, products/services, invoices, payments, processing fees, deposits, refunds, and reconciliation.
- The website stores operational state and opaque QuickBooks references, not a competing general ledger.
- PayPal/Venmo offered through a QuickBooks invoice are QuickBooks-managed methods. No direct PayPal API integration is planned.
- Invoice creation, invoice send acceptance, browser status, and webhooks are not payment proof.
- Payment completion does not determine revenue recognition or tax treatment; accounting configuration remains an owner/accountant decision.
- Product pricing, QuickBooks item mapping, and sales-tax treatment require owner/accountant approval before production activation.

## Release Sequence

1. **Read-only evidence:** Payments activity, enabled methods, and account-displayed rates are recorded; app ownership and webhook configuration remain blocked.
2. **Local and sandbox foundation:** extend the Accounting adapter; implement invoice-send contract mocks, normalized evidence verification, webhook signature tests, scheduled reconciliation, and the status UI without sending a live invoice or email.
3. **Rules and app gates:** obtain the authoritative production Firestore and Storage Rules sources, merge and hash them, map both reviewed files in `firebase.json`, make Java/rules-unit-testing available, and identify the owner/configurator of the production Accounting app. Missing authoritative Rules source, exact mapping, or emulator proof blocks the pilot. App invisibility blocks webhook configuration, but does not by itself block a scheduled-reconciliation pilot when the existing Accounting OAuth connection is authoritatively verified and every other gate passes.
4. **Digital-product pilot:** after explicit approvals, commit the reviewed production parameter file with only `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=true`; keep `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`. Separately approve and send one Firebase authentication email to the exact recorded recipient, then separately approve one QuickBooks invoice send/customer email and its exact recipient, one owner-controlled payment, Accounting/Firebase read-back, and protected fulfillment verification. Provider enablement does not imply either email approval. Scheduled reconciliation is the required recovery path when webhooks are unavailable.
5. **Service invoicing:** only after separate approval and service verification, enable the service flag to move the existing approved service flow from Graph-delivered invoice PDFs to QuickBooks invoice send while retaining the administrator gate and operational Microsoft 365 messages.
6. **Incremental rollout:** enable remaining products only after measured pilot evidence, monitoring, and rollback review.

Each phase requires fresh verification and a separate production-impact approval. Deployments remain scoped to the named Firebase Hosting target or Functions codebase; no broad Firebase deploy is allowed.

## Verification

Automated tests must cover:

- server-authoritative prices and tampered browser amounts;
- one idempotent invoice per order and duplicate create suppression;
- separate invoice-send claims, confirmed responses, failures, and ambiguous outcomes;
- five-minute claim expiry, deterministic create recovery, stale send-to-manual-review recovery, and proof that the recovery worker never resends an ambiguous invoice;
- no fulfillment from invoice creation/send responses, browser state, customer assertions, or webhook payloads;
- exact realm, invoice, order reference, Invoice total/balance/status, Payment total/unapplied amount/status, currency, and one exact Invoice application before the internal completed result;
- partial, split, multi-invoice, unapplied, over-, under-, deleted, voided, reversed, duplicate, unknown-status, and wrong-invoice payment evidence;
- valid and invalid Intuit webhook signatures without storing raw bodies;
- mandatory scheduled recovery when webhooks are disabled, delayed, duplicated, or missed;
- Firebase email-link identity binding, same-UID status authorization, App Check, administrator, rate, schema, email-link/grant replay, and redaction controls;
- paid fulfillment failure and retry without another invoice or payment;
- refund review and authoritative reconciliation;
- protected-download same-UID authorization, ten-minute expiry, digest-only nonce storage, atomic single-use redemption, and concurrent replay denial;
- invoice-sent/payment-verification journeys on desktop and mobile, with no provider URL in HTML, JavaScript, Firebase responses, or Firestore.

Before production activation, Brian must separately approve the exact SKU/price/tax mapping; Rules, Functions, and Hosting deployments; the reviewed parameter-file commit; one Firebase email-link authentication email and its exact recipient; one later QuickBooks invoice send/customer email and its exact recipient; one owner-controlled payment; and any refund. Firebase provider configuration authorizes neither email, and approval of one email does not approve the other even when the recipient is identical. Verification must independently read the resulting Auth identity, Invoice and Payment in QuickBooks, Firebase order/audit state, protected fulfillment, runtime flag readback, and settlement/deposit view. A website status screen is never confirmation.

## Explicit Non-Goals

- No QuickBooks Payments API checkout, hosted payment session, embedded payment form, or website-supplied invoice pay URL.
- No standalone PayPal/Venmo integration or parallel ledger.
- No storage or handling of card, bank, PayPal, or Venmo credentials by Ballers Kingdom.
- No service migration from the existing Graph/PDF path until Brian separately approves enabling `COMMERCE_SERVICE_QBO_SEND_ENABLED`; the administrator gate remains required after migration.
- No production digital invoice send/customer email until the separately approved pilot.
- No fulfillment based on a browser, invoice creation/send response, customer assertion, email, webhook payload, or invoice balance alone.
- No automated provider refund until a current documented capability is verified and separately approved; the initial control is operator action plus Accounting reconciliation.
- No subscription billing, marketplace payouts, multi-currency sales, or broad storefront redesign in the first release.
- No account change, webhook configuration, external message, payment, refund, or deployment without its applicable approval gate.

## Decision Summary

Ballers Kingdom will introduce the QuickBooks payable-invoice path behind separate default-off flags: an email-link-authenticated digital order may create and send one server-priced invoice only during the approved pilot, while the current service Graph/PDF path remains unchanged until a separately approved migration and still retains Brian's administrator gate. QuickBooks presents Cards, PayPal/Venmo, ACH only when available on the invoice, and any future enabled methods on its own invoice surfaces. Firebase fulfills only from exact, independently re-fetched Accounting Invoice and Payment evidence, with webhooks as hints and scheduled reconciliation as mandatory recovery.

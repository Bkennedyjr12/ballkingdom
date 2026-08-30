# Unified QuickBooks Commerce Design

**Status:** Invoice-path revision approved by Brian Kennedy Jr. on 2026-08-30; production implementation and every external write remain separately approval-gated.

## Goal

Give Ballers Kingdom customers one consistent purchase experience while keeping QuickBooks Online as the financial and payment system of record.

- Digital products create and automatically send one server-priced QuickBooks payable invoice, then remain locked until Accounting API evidence proves the exact invoice was paid.
- Scheduled and custom services use the same payable-invoice and payment-verification boundary but retain Brian's existing approval gate before invoice creation or send.
- QuickBooks Payments presents and processes the enabled customer methods. Cards and PayPal/Venmo are confirmed active in the signed-in company; Ballers Kingdom will not build a separate PayPal API, ledger, or reconciliation pipeline.
- Ballers Kingdom never collects card, bank, PayPal, or Venmo credentials and never invents a QuickBooks payment-session or hosted-checkout API.

## Current State and Verified Boundary

The production Firebase integration is connected to the correct QuickBooks Online company and its existing Accounting API adapter can create customers and invoices. On 2026-08-30, an authorized read-only QuickBooks check confirmed that QuickBooks Payments is active and that Cards and PayPal/Venmo are enabled. The account displayed `2.9% + $0.25` for invoiced card and PayPal/Venmo transactions and `1% / max $20` for ACH. These are account-screen observations, not public-price estimates or guarantees about future pricing.

The existing adapter does not yet implement the documented Accounting API invoice-send operation, authoritative Invoice/Payment reads for commerce, webhooks, or commerce reconciliation. The currently signed-in Intuit Developer dashboard shows no app. Therefore the identity that owns or can configure the existing production Accounting OAuth app is not established, and production webhook configuration remains blocked.

This design uses only the existing `com.intuit.quickbooks.accounting` boundary. The current official Accounting API documents Invoice creation, reading, and sending and the Payment entity used to represent customer payments applied to invoices: [Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice), [Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment). No QuickBooks Payments API endpoint, direct wallet endpoint, browser pay URL, or payment-session response is required.

No invoice, email, payment, refund, account change, provider configuration, or deployment is authorized by this design revision. Automatic digital invoice send remains code-only until the separately approved pilot.

## Customer Experience

### Shared entry and order summary

Every sellable product or service uses the same Ballers Kingdom order-summary component. It shows the item, server-returned price or approved quote, customer details, fulfillment terms, refund/cancellation link, and the next action. The browser never receives Intuit credentials, never submits a payment amount as authority, and never decides whether an order is paid.

### Digital products

1. The customer selects an active product and supplies the minimum required name and email address.
2. Firebase creates an immutable server-priced order in the already-defined `pending_payment` state.
3. A durable order effect creates or recovers one QuickBooks customer and one invoice through the existing Accounting adapter. The stable Ballers Kingdom order reference and deterministic Accounting request ID prevent a retry from creating another invoice.
4. A separate durable effect invokes QuickBooks' documented invoice-send operation once. A successful API response records that QuickBooks accepted the send operation; it is not payment proof and is not represented as guaranteed inbox delivery.
5. The website displays `QuickBooks sent payment instructions to your email. Payment verification is pending.` It polls only a normalized Firebase order status and exposes no provider pay URL.
6. QuickBooks presents and processes the payment methods enabled for the invoice, including PayPal/Venmo when QuickBooks makes them available.
7. Firebase re-fetches authoritative Invoice and linked Payment entities, then verifies the exact realm, invoice ID, immutable order reference, amount, currency, zero balance, one active linked payment for the full expected amount, and completed normalized state.
8. Only that verified evidence moves the order once to `paid` and triggers protected fulfillment. Partial, split, over-, under-, deleted, voided, wrong-realm, or mismatched evidence moves to `manual_review` or remains locked.

A browser return, website assertion, invoice creation response, invoice-send response, email screenshot, customer claim, webhook payload, or zero balance without the matching Payment evidence is never payment proof.

### Scheduled and custom services

1. An accepted booking or approved quote creates an operational service order in `pending_invoice_approval`.
2. Brian's existing authenticated administrator gate remains the only path that may claim invoice creation and send.
3. Approval creates or recovers one idempotent QuickBooks invoice, then uses QuickBooks' documented invoice-send operation. The current Microsoft Graph path remains available for operational messages, not a second invoice email.
4. QuickBooks presents the payment methods enabled for that invoice.
5. The same Accounting evidence verifier reconciles the service order from authoritative Invoice and Payment entities.

## Architecture

### Public website

The existing static Firebase Hosting site gains a shared purchase/order-summary module and an order-status page. Ballers Kingdom collects contact details only. Payment credentials and payment-method selection remain on QuickBooks-controlled invoice surfaces reached from the QuickBooks email, not from a website-supplied URL.

### Firebase Functions

The isolated `ballkingdom-integrations` Functions codebase uses five narrow components:

- `commerceCatalog`: existing server-authoritative SKUs, prices, currency, and fulfillment types.
- `orderService`: existing explicit state machine plus transactional orders, effect claims, and audit receipts.
- `quickBooksAccounting`: the existing adapter for customers, items, invoice creation, the documented invoice-send operation, Invoice/Payment reads, and documented change-data capture.
- `quickbooks-payment-verifier`: provider-payload-neutral policy that accepts only normalized Accounting evidence and produces the exact shape required by the existing `validatePaymentResult()` contract.
- `paymentReconciler`: scheduled recovery and webhook-triggered re-fetch for nonterminal orders.

Raw Accounting responses stay inside the adapter. The verifier receives normalized values only, and the rest of the application stores opaque QuickBooks identifiers rather than provider payloads.

### Invoice send boundary

Invoice creation and invoice sending are separate durable effects:

1. A Firestore transaction claims invoice creation.
2. The Accounting adapter creates the invoice with a deterministic request ID or recovers the previously created invoice by its exact Ballers Kingdom order reference.
3. Firestore stores the immutable QuickBooks invoice ID before send is attempted.
4. A second transaction claims invoice send.
5. A confirmed send response completes that effect. An ambiguous timeout does not trigger a blind resend; it remains locked for Accounting read-back or manual review.

This avoids duplicate invoices and minimizes duplicate customer email risk without claiming impossible cross-system atomicity. The implementation must pin the exact request and response to the current official [Invoice documentation](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice); if the documented operation differs from an assumed path or field, the documentation wins.

### Payment verification boundary

The Accounting adapter normalizes authoritative entities into:

```json
{
  "realmId": "opaque-realm",
  "invoiceId": "opaque-invoice",
  "providerOrderRef": "bk-order-order-id",
  "invoiceAmountCents": 4900,
  "invoiceBalanceCents": 0,
  "currency": "USD",
  "payments": [
    {
      "providerPaymentRef": "opaque-payment",
      "linkedInvoiceId": "opaque-invoice",
      "appliedAmountCents": 4900,
      "active": true
    }
  ]
}
```

This is an internal normalized contract, not a claim that Intuit returns these field names. The adapter must map only documented Invoice and Payment entity data. For the first digital-product release, exactly one active Payment must apply the full amount to the expected Invoice; partial or split payments remain locked for manual review. The verifier then passes `{realmId, amountCents, currency, providerOrderRef, providerPaymentRef, status:'completed'}` to the existing `validatePaymentResult()` function.

### Webhook hints and scheduled truth

When the owning Intuit Developer app becomes accessible, an HTTPS endpoint may receive documented QuickBooks Online webhooks for Invoice and Payment changes. It validates Intuit's signature over the unmodified request body before parsing, rejects the wrong realm, stores only normalized entity IDs/operations, and schedules reconciliation. It never transitions an order from webhook payload data. The worker re-fetches the named Accounting entities and runs the same verifier. See Intuit's current [webhooks documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) and [webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices).

Scheduled reconciliation is mandatory whether or not webhooks are configured. It queries due nonterminal orders, re-reads their Invoice, and discovers changed Invoice/Payment entities through the documented Accounting change-data-capture operation before fetching exact entities. Change data capture is a polling aid, not payment truth; the current [official Intuit Developer Accounting collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4) documents its bounded look-back behavior.

### Firestore records

`orders/{orderId}` retains the normalized model established by completed Tasks 1–4:

```json
{
  "sku": "home-inspection-study-guide",
  "orderType": "digital_product",
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
- The webhook verifier token remains in Secret Manager and is bound only if app ownership is established and webhook configuration is separately approved.
- Webhook requests require signature verification, replay-safe event handling, and strict realm matching.
- Logs redact access tokens, refresh tokens, webhook signatures, verifier tokens, payment details, customer content, and provider response bodies.

## State and Idempotency

The completed order-state contract remains:

`created -> pending_payment -> payment_verifying -> paid -> fulfilling -> fulfilled`

Service orders additionally use:

`pending_invoice_approval -> invoice_processing -> invoiced -> payment_verifying`

Terminal exception states are `cancelled`, `refunded`, and `manual_review`. Invoice-create and invoice-send effects are tracked separately from order status so a digital order can remain `pending_payment` while its invoice is prepared and sent.

Every state change and external effect uses a stable key derived from the Ballers Kingdom order ID. Firestore transactions claim invoice creation, invoice send, payment verification, status email, fulfillment, and refund reconciliation once. Ambiguous provider writes do not retry blindly. A scheduled reconciler checks every due nonterminal order so unavailable, delayed, or missed webhooks cannot strand a paid customer.

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
3. **Rules and app gates:** obtain the authoritative production Firestore Rules source, make Java/rules-unit-testing available, and identify the owner/configurator of the production Accounting app. Configure no webhook until separately approved.
4. **Digital-product pilot:** after explicit approvals, deploy one low-risk SKU and perform one QuickBooks invoice send/customer email, one owner-controlled payment, Accounting/Firebase read-back, and protected fulfillment verification.
5. **Service invoicing:** move the existing approved service flow from Graph-delivered invoice PDFs to QuickBooks invoice send while retaining the administrator gate and operational Microsoft 365 messages.
6. **Incremental rollout:** enable remaining products only after measured pilot evidence, monitoring, and rollback review.

Each phase requires fresh verification and a separate production-impact approval. Deployments remain scoped to the named Firebase Hosting target or Functions codebase; no broad Firebase deploy is allowed.

## Verification

Automated tests must cover:

- server-authoritative prices and tampered browser amounts;
- one idempotent invoice per order and duplicate create suppression;
- separate invoice-send claims, confirmed responses, failures, and ambiguous outcomes;
- no fulfillment from invoice creation/send responses, browser state, customer assertions, or webhook payloads;
- exact realm, invoice, order reference, amount, currency, balance, linked Payment, and active/completed-state checks;
- partial, split, over-, under-, deleted, voided, duplicate, and wrong-invoice payment evidence;
- valid and invalid Intuit webhook signatures without storing raw bodies;
- mandatory scheduled recovery when webhooks are disabled, delayed, duplicated, or missed;
- App Check, administrator, rate, schema, replay, and redaction controls;
- paid fulfillment failure and retry without another invoice or payment;
- refund review and authoritative reconciliation;
- protected-download authorization and expiry;
- invoice-sent/payment-verification journeys on desktop and mobile, with no provider URL in HTML, JavaScript, Firebase responses, or Firestore.

Before production activation, Brian must separately approve the exact SKU/price/tax mapping, deployment, one QuickBooks invoice send and customer email, one owner-controlled payment, and any refund. Verification must independently read the resulting Invoice and Payment in QuickBooks, Firebase order/audit state, protected fulfillment, and settlement/deposit view. A website status screen is never confirmation.

## Explicit Non-Goals

- No QuickBooks Payments API checkout, hosted payment session, embedded payment form, or website-supplied invoice pay URL.
- No standalone PayPal/Venmo integration or parallel ledger.
- No storage or handling of card, bank, PayPal, or Venmo credentials by Ballers Kingdom.
- No automatic service invoice creation or send before Brian's existing approval gate.
- No production digital invoice send/customer email until the separately approved pilot.
- No fulfillment based on a browser, invoice creation/send response, customer assertion, email, webhook payload, or invoice balance alone.
- No automated provider refund until a current documented capability is verified and separately approved; the initial control is operator action plus Accounting reconciliation.
- No subscription billing, marketplace payouts, multi-currency sales, or broad storefront redesign in the first release.
- No account change, webhook configuration, external message, payment, refund, or deployment without its applicable approval gate.

## Decision Summary

Ballers Kingdom will use one QuickBooks payable-invoice path with two authorization modes: digital orders may create and send one server-priced invoice automatically after the production pilot is approved, while service orders retain Brian's administrator approval before invoice creation/send. QuickBooks presents Cards, PayPal/Venmo, ACH, and any future enabled methods on its own invoice surfaces. Firebase fulfills only from exact, independently re-fetched Accounting Invoice and Payment evidence, with webhooks as hints and scheduled reconciliation as mandatory recovery.

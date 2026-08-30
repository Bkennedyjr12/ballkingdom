# Unified QuickBooks Commerce Design

**Status:** Approved in principle by Brian Kennedy Jr. on 2026-08-29; awaiting written-spec review before implementation planning.

## Goal

Give Ballers Kingdom customers one consistent purchase experience while keeping QuickBooks Online as the financial system of record.

- Digital products use immediate payment verification before fulfillment.
- Scheduled and custom services use payable QuickBooks invoices.
- QuickBooks Payments is the primary payment processor.
- PayPal and Venmo are customer payment methods presented through QuickBooks when the connected merchant account supports them; Ballers Kingdom will not build a separate PayPal ledger or reconciliation pipeline.

## Current State

The production Firebase integration is connected to the correct QuickBooks Online company and can create customers and invoices through the Accounting API. It does not yet collect payments, verify payment completion, expose customer checkout, or fulfill paid digital products. The storefront therefore remains correctly fail-closed.

The first release gate is to verify, from the signed-in QuickBooks company and Intuit developer configuration, that:

1. QuickBooks Payments is approved and active for the company.
2. The production Intuit app is eligible for the required Payments capability.
3. The company can present the approved customer methods, including PayPal where available.
4. The merchant deposit account and production rates are understood by the owner.

No merchant application, pricing acceptance, account change, test charge, or production payment may occur during verification without Brian's explicit approval.

## Customer Experience

### Shared entry and order summary

Every sellable product or service uses the same Ballers Kingdom order-summary component. It shows the item, price or quoted amount, customer details, fulfillment terms, refund/cancellation link, and the next action. The browser never receives Intuit credentials and never decides whether an order is paid.

### Digital products

1. The customer selects a product and supplies the minimum required contact information.
2. Firebase creates an immutable server-priced order in `pending_payment` state.
3. The customer completes a QuickBooks-supported payment flow.
4. Firebase independently verifies the provider transaction and its amount, currency, merchant/company, and order reference.
5. A verified order moves once to `paid`, creates or reconciles the corresponding QuickBooks sale, and triggers protected fulfillment.
6. The customer receives a confirmation and can retrieve the deliverable through a short-lived, order-bound access route.

A browser redirect, screenshot, query parameter, or client callback is never proof of payment.

### Scheduled and custom services

1. An accepted booking or approved quote creates the QuickBooks customer and draft invoice.
2. Brian's existing approval gate remains in place before the invoice is finalized or sent.
3. The payable invoice presents the payment methods enabled by QuickBooks Payments, including PayPal or Venmo when QuickBooks makes them available.
4. QuickBooks records the payment against the invoice and Firebase reconciles its local order/appointment status from independently verified provider data.
5. Microsoft 365 sends Ballers Kingdom operational messages from `info@ballkingdom.com`; QuickBooks remains authoritative for the accounting document and payment state.

## Architecture

### Public website

The existing static Firebase Hosting site gains a shared cart/order-summary module and product-specific purchase buttons. Card, bank, PayPal, and wallet details remain on provider-controlled surfaces or provider-hosted components; Ballers Kingdom does not handle raw payment credentials.

### Firebase Functions

The isolated `ballkingdom-integrations` Functions codebase gains four narrow components:

- `commerceCatalog`: server-authoritative SKUs, prices, taxes, and fulfillment types.
- `orderService`: creates idempotent orders and controls allowed state transitions.
- `quickBooksPayments`: wraps only documented, production-supported Intuit payment capabilities.
- `paymentReconciler`: verifies provider events and performs scheduled recovery for missed or delayed events.

The existing QuickBooks Accounting adapter continues to own customers, items, invoices, and accounting references. Payment and accounting adapters communicate through typed internal results rather than sharing provider payloads throughout the application.

### Firestore records

`orders/{orderId}` stores normalized, non-secret commerce state:

```json
{
  "sku": "home-inspection-study-guide",
  "orderType": "digital_product",
  "customer": {"name": "Customer Name", "email": "customer@example.com"},
  "amountCents": 0,
  "currency": "USD",
  "status": "pending_payment",
  "provider": "quickbooks",
  "providerRefs": {},
  "fulfillment": {"status": "locked"},
  "createdAt": "server timestamp"
}
```

Prices come from `commerceCatalog`, not browser input. Provider references are opaque identifiers; tokens and sensitive payment data never enter Firestore. Audit receipts record transitions without storing full customer or provider payloads.

### Secrets and authorization

- OAuth credentials and refresh tokens remain in Google Secret Manager.
- QuickBooks connection and administrative operations require Firebase Authentication, App Check, and the `admin: true` custom claim.
- Provider callbacks require signed state or documented signature verification, replay protection, and strict company/realm matching.
- Runtime identities receive only the secret-version and database permissions required by their functions.
- Logs redact access tokens, refresh tokens, payment details, customer content, and provider response bodies.

## State and Idempotency

Orders follow an explicit state machine:

`created -> pending_payment -> payment_verifying -> paid -> fulfilling -> fulfilled`

Terminal exception states are `cancelled`, `refunded`, and `manual_review`. Failures that may be retried retain their prior verified state plus a redacted error receipt.

Every provider write uses a stable idempotency key derived from the Ballers Kingdom order ID. Firestore transactions claim each payment, invoice, email, and fulfillment action once. A scheduled reconciler checks nonterminal orders so a delayed callback cannot strand a paid customer.

## Error Handling and Customer Safety

- A failed or abandoned checkout leaves the order unpaid and the deliverable locked.
- A provider success that has not yet been independently verified displays `Payment verification in progress`; it never grants optimistic access.
- Amount, currency, realm, duplicate-payment, or order-reference mismatches move to `manual_review` and do not fulfill.
- A fulfillment failure after verified payment preserves `paid`, retries safely, and alerts the administrator without charging again.
- Refunds require an authenticated administrator, a reason, provider confirmation, and a reconciled QuickBooks record before the order is marked `refunded`.
- Public errors contain no provider payloads, credentials, stack traces, or private accounting information.

## Accounting Rules

- QuickBooks is authoritative for customers, products/services, invoices, payments, processing fees, deposits, refunds, and reconciliation.
- The website stores operational state and opaque QuickBooks references, not a competing general ledger.
- PayPal payments offered through QuickBooks are treated as QuickBooks-processed payment methods. No direct PayPal API integration is planned.
- Payment completion alone does not determine revenue recognition or tax treatment; accounting configuration remains an owner/accountant decision.
- Product pricing and applicable sales-tax treatment must be approved before production activation.

## Release Sequence

1. **Merchant verification:** confirm QuickBooks Payments status and production API eligibility without changing the account.
2. **Sandbox foundation:** implement catalog, orders, provider adapter, webhook/callback verification, and reconciliation against documented Intuit sandbox behavior.
3. **Digital-product pilot:** enable one low-risk SKU for owner-only end-to-end testing; verify payment, QuickBooks records, fee/deposit treatment, and protected fulfillment.
4. **Service invoicing:** connect the shared order summary to the existing booking and invoice-approval workflow.
5. **Production rollout:** enable remaining products incrementally with monitoring and rollback controls.

Each phase requires passing tests and a separate production-impact approval. Deployments are scoped to the Firebase Hosting target or named Functions codebase; no broad Firebase deploy is allowed.

## Verification

Automated tests must cover:

- server-authoritative prices and tampered browser amounts;
- state transitions, retries, and duplicate callbacks;
- realm, amount, currency, signature/state, and order-reference validation;
- admin and App Check enforcement;
- payment success with delayed verification;
- payment success followed by fulfillment failure;
- refunds and reconciliation;
- protected-download authorization and expiry;
- redaction of secrets and payment details;
- digital-product and service customer journeys on desktop and mobile.

Before production activation, complete one owner-controlled low-value transaction and independently verify the result in QuickBooks Payments, the QuickBooks accounting records, the settlement/deposit view, Firebase audit state, and customer experience. Refund the test only with explicit approval and verify the refund independently in the same systems.

## Explicit Non-Goals

- No standalone PayPal integration or parallel PayPal ledger.
- No storage or handling of raw card or bank credentials by Ballers Kingdom.
- No automatic invoice send before the existing owner approval gate.
- No optimistic fulfillment based on a browser redirect.
- No subscription billing, marketplace payouts, multi-currency sales, or broad storefront redesign in the first release.
- No production charge, account activation, outbound message, or deploy without its applicable approval gate.

## Decision Summary

Ballers Kingdom will use one customer-facing commerce experience with two fulfillment paths: immediate verified payment for digital products and approved payable invoices for services. QuickBooks Online remains the system of record, QuickBooks Payments is the processor, and PayPal is accepted through QuickBooks when the merchant account exposes it.

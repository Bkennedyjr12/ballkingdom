# QuickBooks Commerce Capability Evidence

**Recorded:** 2026-08-29

**Revised:** 2026-08-30 after authorized read-only QuickBooks and Intuit Developer checks

## Decision

The unsupported embedded/immediate-checkout assumption is retired. The approved digital path uses the existing QuickBooks Online Accounting OAuth boundary to create one server-priced payable invoice, invoke QuickBooks' documented invoice-send operation, and wait for independently re-fetched Invoice and Payment evidence before fulfillment.

This decision does not authorize a production invoice, email, payment, refund, account change, webhook configuration, deployment, or customer pilot. Automatic digital invoice send remains code-only until Brian separately approves the exact production pilot. Service invoicing remains independently gated by the existing authenticated administrator approval.

Ballers Kingdom will not collect payment credentials, expose an inferred invoice pay URL, call a direct PayPal/Venmo API, or depend on a QuickBooks Payments API hosted-checkout/payment-session endpoint. Cards and PayPal/Venmo remain methods presented and processed by QuickBooks.

## Merchant and app evidence

| Evidence item | Status | Recorded value / boundary | Source |
| --- | --- | --- | --- |
| QuickBooks Payments state | Confirmed | Active in the signed-in QuickBooks company. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| Enabled customer methods | Confirmed | Cards and PayPal/Venmo are enabled through QuickBooks. No direct PayPal/Venmo integration is authorized. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| Invoiced card and PayPal/Venmo rate | Confirmed as account-displayed evidence | `2.9% + $0.25` per transaction. This is a dated account-screen observation, not a guarantee of future pricing. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| ACH rate | Confirmed as account-displayed evidence | `1% / max $20`. The displayed rate is not, by itself, proof that ACH is enabled on every invoice. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| Deposit account | Not retained | No bank account number or suffix is required for this architecture record. Settlement/deposit truth remains a pilot verification item. | Authorized QuickBooks company view required during approved pilot |
| Existing production Accounting app ownership | Blocked | The signed-in Intuit Developer dashboard shows no app. Do not claim this identity owns, can configure, or can rotate the existing production Accounting OAuth app. | Authorized read-only Intuit Developer dashboard, 2026-08-30 |
| Webhook configuration | Blocked | Invoice/Payment webhook code may be built and tested, but the production endpoint cannot be configured until the owning developer app is identified and access is approved. | [Intuit QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) |
| Accounting OAuth scope | Confirmed from repository | `com.intuit.quickbooks.accounting` is the only configured QuickBooks scope. This is sufficient for the planned Accounting Invoice/Payment reads and writes; no Payments API scope is assumed. | [`functions/src/providers/oauth.js`](../../functions/src/providers/oauth.js), [`functions/README.md`](../../functions/README.md) |
| Existing Accounting adapter | Confirmed from repository | The current client creates/fetches customers and items, creates an invoice with a stable `requestid`, and reads invoice PDFs. It does not yet send invoices or normalize Invoice/Payment truth for commerce. | [`functions/src/providers/quickbooks.js`](../../functions/src/providers/quickbooks.js) |
| Authoritative Firestore Rules source | Blocked | The repository contains only an unconfigured commerce-deny fragment. It is not the verified production ruleset and must not be wired for deploy until the authoritative source is recovered and merged. Java/rules-unit-testing is also unavailable, so runtime auth-context emulator proof is still missing. | [`firestore.rules`](../../firestore.rules), Task 4 implementation report |

## Supported Accounting boundary

The current official Accounting API documents the capabilities this plan may use:

- The [Invoice entity](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice) covers invoice creation, read, and the documented send operation. Implementation tests must pin the exact current request and response. If a remembered endpoint or field conflicts with the official operation, the documentation wins.
- The [Payment entity](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment) represents a customer payment applied to one or more invoices. Raw provider objects stay inside the Accounting adapter.
- [QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) provide Invoice/Payment change notifications after an owning app is configured. The receiver must validate Intuit's signature over the unchanged request body and then re-fetch entities; payload data is never payment proof.
- The current [official Intuit Developer Accounting collection for change data capture](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4) documents polling for entities changed within its bounded look-back window. Scheduled reconciliation remains mandatory even if webhooks become available.

The approved normalized verifier accepts Accounting evidence only after all of these checks pass:

1. Exact connected realm.
2. Exact stored QuickBooks invoice ID.
3. Exact immutable Ballers Kingdom order reference embedded when the invoice was created.
4. Exact server-priced invoice amount and uppercase currency.
5. Zero invoice balance.
6. Exactly one active Payment whose linked Invoice ID and applied amount equal the expected invoice and total for the first digital pilot.
7. A normalized `completed` result produced by those checks, never copied from a browser, email, customer assertion, send response, or webhook payload.

Partial, split, over-, under-, deleted, voided, wrong-realm, wrong-invoice, wrong-reference, or wrong-currency evidence remains locked for manual review. A later decision may deliberately support split payments, but this revision does not silently broaden the verified contract established by completed Tasks 1–4.

## Send and webhook safety boundary

Invoice creation and invoice send are separate durable effects. A deterministic Accounting request ID and exact order reference prevent duplicate invoice creation. The send effect is claimed once in Firestore. A confirmed send response records only that QuickBooks accepted the send operation; it is neither inbox-delivery proof nor payment proof. An ambiguous send timeout must not trigger a blind resend and duplicate customer email; reconciliation or manual review decides the next action.

Webhooks are optional acceleration and remain a production blocker because the app is invisible to the signed-in developer identity. Scheduled reconciliation is not optional: it re-reads due nonterminal orders and their authoritative Invoice/Payment entities when webhooks are unavailable, delayed, duplicated, or missed.

## Release blockers and approval gates

- Identify and obtain approved access to the Intuit Developer app that owns the production Accounting OAuth connection; do not infer ownership from stored credentials or a working connection.
- Configure no production webhook until that app is visible, its realm/app mapping is verified, the endpoint and verifier token are reviewed, and Brian approves the change.
- Recover the authoritative production Firestore Rules source, merge the narrow commerce denies, install/verify Java rules-unit-testing, and run the full signed-out/ordinary/admin emulator suite before any rules release.
- Confirm the current Invoice send request/response against official documentation in tests; do not invent a path, field, delivery receipt, or pay URL.
- Approve the exact SKU, price, QuickBooks item, tax treatment, scoped deploys, one QuickBooks invoice send, its customer email recipient, one owner-controlled payment, and any refund as separate production actions.
- Keep fulfillment locked until Accounting Invoice and Payment evidence passes the exact normalized verifier.

## Official documentation consulted

- [QuickBooks Online Accounting API: Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice)
- [QuickBooks Online Accounting API: Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment)
- [QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks)
- [QuickBooks Online webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices)
- [QuickBooks Online OAuth 2.0](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [Official Intuit Developer QuickBooks Online Accounting API collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/overview)
- [Official Intuit Developer Accounting change-data-capture collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4)

These sources define technical capabilities. The merchant state, enabled methods, displayed rates, and invisible-app finding above come only from the authorized signed-in views and are not inferred from public documentation.

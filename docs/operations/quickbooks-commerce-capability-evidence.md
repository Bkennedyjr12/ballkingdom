# QuickBooks Commerce Capability Evidence

**Recorded:** 2026-08-29

**Revised:** 2026-09-01 after authorized read-only public-checkout release review

## Decision

The unsupported embedded/immediate-checkout assumption is retired. The approved digital path uses the existing QuickBooks Online Accounting OAuth boundary to create one server-priced payable invoice, invoke QuickBooks' documented invoice-send operation, and wait for independently re-fetched Invoice and Payment evidence before fulfillment.

This decision does not authorize a production invoice, email, payment, refund, account change, webhook configuration, deployment, or customer pilot. Automatic digital invoice send remains code-only until Brian separately approves the exact production pilot. Service invoicing remains independently gated by the existing authenticated administrator approval.

Ballers Kingdom will not collect payment credentials, expose an inferred invoice pay URL, call a direct PayPal/Venmo API, or depend on a QuickBooks Payments API hosted-checkout/payment-session endpoint. Cards and PayPal/Venmo remain methods presented and processed by QuickBooks; ACH is an option only when QuickBooks exposes it on the particular invoice.

## 2026-09-01 public-checkout capability refresh

The signed-in production company was independently re-read as `The Ballers Kingdom`. Its selected
QuickBooks Payments merchant account exposes merchant details, deposit configuration, processing
limits, standard card/bank deposit speeds, and the Merchant Service Center. Account Settings shows
Payment Methods `Cards` and `PayPal and Venmo`. Sales settings show invoice defaults `Accept Credit
Cards: On`, `Accept ACH: On`, and `Accept PayPal: On`, plus online invoice email delivery to customers
with saved email addresses.

The production Products & services view shows item ID `8`, name `Home Inspection Study Guide`, type
`Non-Inventory`, description `Digital Home Inspection Study Guide — electronic delivery only`, and
price `$49.00`. Its detail view shows income account `Services`; its read-only edit panel shows sales
tax category `Nontaxable`, corresponding to the exact reviewed Accounting invoice mapping
`TaxCodeRef.value='NON'`.

Apple Pay is not a browser-selected provider field. Intuit's official
[Apple Pay FAQ](https://quickbooks.intuit.com/learn-support/en-us/help-article/receive-payments/frequently-asked-questions-apple-pay-quickbooks/L1yOQUp7l_US_en_US)
says an emailed invoice with Credit card selected can expose Apple Pay when the customer uses Safari
on an eligible Apple device with an eligible card. Intuit's official
[invoice surcharge article](https://quickbooks.intuit.com/learn-support/en-us/help-article/process-credit-card-payments/add-surcharge-customer-invoice-payments-quickbooks/L6Sg9UWf9_US_en_US)
says surcharging disables Apple Pay. The 2026-09-01 read-only view observed no surcharge control or
enabled surcharge state on the representative invoice-payment path; this is representative-path
evidence, not global proof that no QuickBooks surface can enable surcharging. The separately
approved controlled owner invoice must visibly show Apple Pay before public activation.
PayPal/Venmo remains directly visible as enabled merchant evidence. No settings were changed, no
invoice was created or sent, and no provider write occurred during this refresh.

## Merchant and app evidence

| Evidence item | Status | Recorded value / boundary | Source |
| --- | --- | --- | --- |
| QuickBooks Payments state | Confirmed | Active in the signed-in QuickBooks company. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| Enabled customer methods | Confirmed | Cards and PayPal/Venmo are enabled through QuickBooks. No direct PayPal/Venmo integration is authorized. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| Invoiced card and PayPal/Venmo rate | Confirmed as account-displayed evidence | `2.9% + $0.25` per transaction. This is a dated account-screen observation, not a guarantee of future pricing. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| ACH rate | Confirmed as account-displayed evidence | `1% / max $20`. The displayed rate is not, by itself, proof that ACH is enabled on every invoice. | Authorized read-only QuickBooks Payments view, 2026-08-30 |
| Deposit account | Not retained | No bank account number or suffix is required for this architecture record. Settlement/deposit truth remains a pilot verification item. | Authorized QuickBooks company view required during approved pilot |
| Existing production Accounting app visibility | Confirmed | The signed-in workspace `The Ballers Kingdom` shows app `TBK Q.B A.I` marked `IN PRODUCTION`. This establishes current dashboard visibility, not current Accounting OAuth health or permission to rotate credentials. | Authorized read-only Intuit Developer dashboard, 2026-08-30 |
| Webhook configuration | Confirmed unconfigured | The production webhook endpoint field is empty (length 0) and Save is disabled. No verifier token, key, or credential was viewed and no change was made. Webhook configuration remains a separate approval; scheduled reconciliation remains mandatory and supports the no-webhook pilot design after all other gates pass. | Authorized read-only Intuit Developer dashboard, 2026-08-30; [Intuit QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) |
| Accounting OAuth scope | Confirmed from repository | `com.intuit.quickbooks.accounting` is the only configured QuickBooks scope. This is sufficient for the planned Accounting Invoice/Payment reads and writes; no Payments API scope is assumed. | [`functions/src/providers/oauth.js`](../../functions/src/providers/oauth.js), [`functions/README.md`](../../functions/README.md) |
| Production Accounting OAuth health | Required post-deploy gate; not yet executed | After the inactive deployment, the operator must read the published credential binding and enabled version metadata, run a bounded refresh through the deployed coordinator, prove rotation persistence by reading the newly published binding/version metadata, then read the exact configured realm and `CompanyInfo.CompanyName='The Ballers Kingdom'`. Failure stops before any authentication email, order, QuickBooks Customer, or Invoice mutation. | [`qbo-production-accounting-health-observation.json`](evidence/qbo-production-accounting-health-observation.json); [`quickbooks-token-rotation-local-evidence.md`](quickbooks-token-rotation-local-evidence.md) |
| Existing Accounting adapter | Confirmed from repository | The current client creates/fetches customers and items, creates invoices with stable request IDs, sends invoices, reads exact Invoice/Payment evidence, and normalizes CDC hints. These are local implementation facts distinct from the dated production health observation. | [`functions/src/providers/quickbooks.js`](../../functions/src/providers/quickbooks.js), commerce provider tests |
| Protected artifact and Rules evidence | Confirmed by the current release artifacts | The catalog pins the verified private PDF generation, byte length, SHA-256, MD5, and MIME type. Direct Storage access remains denied and the full Firestore/Storage emulator matrix passes. Deployment state must be re-read independently during the release. | [`protected-commerce-delivery-verification.md`](protected-commerce-delivery-verification.md); [`firebase-commerce-rules-source-evidence.md`](firebase-commerce-rules-source-evidence.md) |

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
4. Invoice `TotalAmt` equals the exact server-priced amount, uppercase currency matches, and `Balance` is zero.
5. The documented Invoice entity status/deletion/void/payment-state evidence normalizes to present and paid; deleted, voided, reversed, partially paid, unknown, or missing state fails closed.
6. Exactly one present Payment has `TotalAmt` equal to the expected amount, `UnappliedAmt` equal to zero, and exactly one line application whose `Amount`, `LinkedTxn.TxnId`, and `LinkedTxn.TxnType` identify the full amount and only the expected Invoice.
7. The documented Payment entity status/deletion/void evidence is neither deleted nor voided. A missing, unknown, or conflicting state fails closed; no invented `active` Boolean is accepted.
8. Only after checks 1–7 pass does the application construct Task 3's normalized `completed` value. No Intuit response is assumed to contain that application status, and it is never copied from a browser, email, customer assertion, send response, or webhook payload.

Partial, split, multi-invoice, unapplied, over-, under-, deleted, voided, reversed, unknown-status, wrong-realm, wrong-invoice, wrong-reference, or wrong-currency evidence remains locked for manual review. A later decision may deliberately support split payments, but this revision does not silently broaden the verified contract established by completed Tasks 1–4. These fields and entity-operation semantics must be pinned to the current official [Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice), [Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment), and [Intuit-maintained Accounting collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/overview) before implementation.

## Public customer authorization and rollout boundary

Firebase email-link authentication, not an order handle or App Check alone, is the public customer
authorization contract. The App Check-enforced compatibility callable `requestPilotSignInLink`
accepts any syntactically valid normalized public email only after bounded abuse controls and always
returns one generic result. The browser never sends mail directly. A transactional authentication
effect has a unique claim, bounded lease, capped reissue behavior, and ambiguous-send quarantine; it
never blindly resends after dispatch ambiguity.

After sign-in, `createDigitalOrder` requires App Check and an authoritative Firebase user whose
email is verified. The service derives customer UID and email from that record, ignores browser
identity/provider fields, and atomically reserves one customer/SKU order before QuickBooks work.
Duplicate or parallel calls recover the same owned order or fail closed. Status, grant creation, and
download redemption require the same UID. Download grants are short-lived, single-use, digest-only,
and bound to one paid order/customer/SKU. Direct Storage reads remain denied.

The committed deployment flags are `COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=false`,
`COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false`, and
`COMMERCE_SERVICE_QBO_SEND_ENABLED=false`. The inactive release must read back false/false/false before
any customer effect. Before activation, the post-deploy Accounting health gate must prove the
published credential binding and version metadata, bounded refresh, persisted rotation, exact realm,
and `CompanyInfo.CompanyName='The Ballers Kingdom'`. Any failure stops before an authentication
email, order, QuickBooks Customer, or Invoice. Only a separately reviewed activation commit may set
the auth/resume and ordering flags true together; the service flag remains false. An emergency disable
sets ordering false while leaving auth/resume true for existing paid-customer recovery.

## Send and webhook safety boundary

Invoice creation and invoice send are separate durable effects. A deterministic Accounting request ID and exact order reference prevent duplicate invoice creation. Each effect claim records a claim ID, claim time, and five-minute lease. A stale create claim may recover the exact Invoice before retry. A stale invoice-send claim is ambiguous: scheduled recovery moves it to `manual_review` with `invoice_send_unknown` and never blindly resends. A confirmed send response records only that QuickBooks accepted the send operation; it is neither inbox-delivery proof nor payment proof.

Webhooks are optional acceleration. The production app is visible, but its webhook endpoint is unconfigured and no change is authorized. This does not by itself block a digital pilot if the existing Accounting OAuth connection is authoritatively working and every identity, Rules, emulator, feature-flag, scoped-release, invoice, and payment gate passes. Scheduled reconciliation is not optional and may support that pilot without webhooks: it re-reads due nonterminal orders, recovers stale claims, and checks authoritative Invoice/Payment entities when webhooks are unavailable, delayed, duplicated, or missed.

## Release blockers and approval gates

- Keep production webhook configuration separate and unapproved. Before any future webhook change, verify the app/realm mapping, endpoint, and verifier-token secret boundary, review the exact change, and obtain Brian's approval.
- Preserve the recovered production Firestore source, merge the narrow commerce denies, install/verify Java and rules-unit-testing, and run the full signed-out/ordinary/admin emulator suite before any Rules mapping or release.
- Preserve the verified private per-SKU artifact identity, direct-read denial, and signed-out/wrong-user/owner/admin emulator proof before release.
- Only after recovering and merging the authoritative Firestore source, add `"rules":"firestore.rules"` alongside the existing indexes mapping in `firebase.json`; only after the equivalent Storage recovery, add `"storage":{"rules":"storage.rules"}`. A missing or mismatched mapping blocks its dry run and release.
- Confirm Firebase email-link authentication, verified-email UID binding, same-owner status, expired/replayed link denial, capped public abuse controls, and single-use download-grant behavior.
- Keep all three commerce feature flags false in the inactive project parameter file. Activation enables `COMMERCE_PUBLIC_AUTH_RESUME_ENABLED` and `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED` together; `COMMERCE_SERVICE_QBO_SEND_ENABLED` remains false. Emergency disable turns ordering off while preserving auth/resume. Record the reviewed config commit, deploy log, and protected runtime readback.
- Pass the post-inactive-deploy QuickBooks health gate before the first authentication email or any order/Customer/Invoice mutation.
- Confirm the current Invoice send request/response against official documentation in tests; do not invent a path, field, delivery receipt, or pay URL.
- Approve the exact SKU, price, QuickBooks item, tax treatment, scoped deploys, one controlled owner authentication email, one later QuickBooks invoice send, the owner payment, and any refund as separate production actions. Confirm Apple Pay is visible on that controlled invoice before public activation.
- Keep fulfillment locked until Accounting Invoice and Payment evidence passes the exact normalized verifier.

## Official documentation consulted

- [QuickBooks Online Accounting API: Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice)
- [QuickBooks Online Accounting API: Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment)
- [QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks)
- [QuickBooks Online webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices)
- [QuickBooks Online OAuth 2.0](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [Intuit: Frequently asked questions about Apple Pay and QuickBooks](https://quickbooks.intuit.com/learn-support/en-us/help-article/receive-payments/frequently-asked-questions-apple-pay-quickbooks/L1yOQUp7l_US_en_US)
- [Intuit: Add a surcharge to customer invoice payments](https://quickbooks.intuit.com/learn-support/en-us/help-article/process-credit-card-payments/add-surcharge-customer-invoice-payments-quickbooks/L6Sg9UWf9_US_en_US)
- [Official Intuit Developer QuickBooks Online Accounting API collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/overview)
- [Official Intuit Developer Accounting change-data-capture collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4)
- [Firebase: Configure the Cloud Functions environment](https://firebase.google.com/docs/functions/config-env)
- [Firebase Functions `defineBoolean` reference](https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.params#defineboolean)
- [Firebase Authentication: Email-link sign-in for web](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Firebase Authentication: Generate email action links with the Admin SDK](https://firebase.google.com/docs/auth/admin/email-action-links)
- [Firebase Admin Node: `BaseAuth.generateSignInWithEmailLink`](https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.baseauth#baseauthgeneratesigninwithemaillink)

These sources define technical capabilities. The merchant state, enabled methods, displayed rates, and invisible-app finding above come only from the authorized signed-in views and are not inferred from public documentation.

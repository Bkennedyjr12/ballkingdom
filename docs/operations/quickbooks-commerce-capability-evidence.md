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

Apple Pay is not a browser-selected provider field. Intuit conditionally presents it through the
enabled e-invoice card option when the customer uses Safari on an eligible Apple device with an
eligible card. The representative invoice settings expose no surcharge option or enabled surcharge
state. PayPal/Venmo remains directly visible as enabled merchant evidence. No settings were changed,
no invoice was created or sent, and no provider write occurred during this refresh.

The earlier single-recipient pilot authorization prose below is historical design evidence. The
current public implementation accepts bounded, rate-limited public email recipients after App Check
and later binds orders to an authoritative verified Firebase user email. The retained callable export
name `requestPilotSignInLink` is a compatibility interface, not a public-recipient allowlist.

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
| Production Accounting OAuth health | Historical success; currently blocked | At `2026-08-30T23:30:50Z`, OAuth refresh and CompanyInfo returned HTTP `200` and exact CompanyName `The Ballers Kingdom`, but the test intentionally did not persist the rotated refresh credential. The deployment-pinned credential subsequently failed. An approved reconnect completed and added enabled version 3 metadata for the refresh-token and realm secrets, but no fresh health read followed. Current blocker: `rotating_token_persistence_runtime_fix_unreviewed_undeployed`. | [`qbo-production-accounting-health-observation.json`](evidence/qbo-production-accounting-health-observation.json) |
| Existing Accounting adapter | Confirmed from repository | The current client creates/fetches customers and items, creates invoices with stable request IDs, sends invoices, reads exact Invoice/Payment evidence, and normalizes CDC hints. These are local implementation facts distinct from the dated production health observation. | [`functions/src/providers/quickbooks.js`](../../functions/src/providers/quickbooks.js), commerce provider tests |
| Authoritative Firestore Rules source | Recovered; reviewed derivative mapped locally and undeployed | The retained live source hashes to `0d700ff3…94a5`. Root `firestore.rules` now hashes to accepted candidate `78138d8c…f122`, preserves the recovered policy plus narrow commerce denies, is explicitly mapped, and passed the local Rules emulator matrix. It has not been deployed. | [`firebase-commerce-rules-source-evidence.md`](firebase-commerce-rules-source-evidence.md), authorized read-only Firebase Rules API and local emulator evidence, 2026-08-30 |
| Authoritative Storage Rules source | Recovered; reviewed derivative mapped locally; artifact absent | The retained live source hashes to `fb998765…86ef`. Root `storage.rules` now hashes to accepted candidate `5d5bc015…3de8`, is explicitly mapped, and passed the local emulator matrix. The verified bucket still contains no paid pilot artifact or approved per-SKU placement; no Rules deployment occurred. | [`firebase-commerce-rules-source-evidence.md`](firebase-commerce-rules-source-evidence.md), authorized read-only Firebase Rules/Storage APIs and local emulator evidence, 2026-08-30 |

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

## Customer authorization and rollout boundary

The first digital pilot uses Firebase email-link authentication, not an order handle or App Check alone, as the customer authorization contract. The browser cannot send authentication mail directly. It may submit an address only to the App Check-enforced `requestPilotSignInLink` callable, which constant-time compares fixed-length digests against the `defineSecret`-declared `COMMERCE_PILOT_RECIPIENT_EMAIL` and returns the same generic response for allowed and mismatched addresses. A mismatch produces no Firebase Admin generation, Graph call, or mail effect. The approved address may create only one transactional `pilot_auth_email` effect. Firebase Admin generates the link in memory with the documented `getAuth().generateSignInWithEmailLink(email, actionCodeSettings)`, and the existing injected Microsoft Graph adapter sends a dedicated authentication message from `info@ballkingdom.com`. See Firebase's current [Admin action-link guide](https://firebase.google.com/docs/auth/admin/email-action-links) and [`BaseAuth.generateSignInWithEmailLink` reference](https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.baseauth#baseauthgeneratesigninwithemaillink).

The authentication effect has a unique claim, five-minute lease, and a maximum of one confirmed or ambiguous dispatch. A known pre-dispatch failure may recover; after `dispatchStartedAt`, a timeout/crash becomes `manual_review`/`pilot_auth_email_unknown` and can never resend. Its redacted receipt is separate from the later `invoice_send` receipt. Enabling the Firebase provider, creating the exact-recipient Secret Manager version, sending one Graph authentication email, and later sending one QuickBooks invoice email are four separate approval gates. Public Hosting activation authorizes none of them and cannot make arbitrary addresses send.

After sign-in, `createDigitalOrder` requires App Check and a Firebase ID token with `email_verified:true`, constant-time compares the token email to the same secret allowlist, derives the immutable `customerUid` and email from the token, and atomically creates both a unique approved-recipient/SKU reservation and the order before invoice creation. Duplicate or parallel calls recover the same owned order or fail closed; they cannot create a second pilot order or invoice. Status, grant creation, and download redemption require the same UID. A 256-bit download nonce is stored only as a SHA-256 digest, bound to one order/customer/SKU, expires in ten minutes, and is atomically consumed once by an authenticated streaming Function; wrong-user, expired, concurrent, and replay attempts fail closed. Direct Storage reads remain denied.

Two deployment-time flags are independent and default false: `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED` and `COMMERCE_SERVICE_QBO_SEND_ENABLED`. Their only production source is the committed, non-secret `functions/.env.the-ballers-kingdom`, narrowly unignored in `functions/.gitignore`; its initial reviewed values are both `false`. Firebase's current [parameterized configuration guide](https://firebase.google.com/docs/functions/config-env) says the CLI loads parameter values from `.env.<project_ID>` and that the file may be version-controlled, while the current [`defineBoolean` reference](https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.params#defineboolean) confirms Boolean parameters are read from those files. The first pilot changes the committed digital value to `true` in a reviewed configuration commit while the service value remains `false`. An unexpected deployment prompt for either flag aborts the release. Post-deploy verification uses an admin/App Check-protected runtime Boolean readback plus behavioral smoke tests; ignored dotenv state, memory, or an unrecorded prompt response is not release evidence.

The release order is fail-closed: deploy and read back the non-secret false/false state; separately approve and create the exact recipient secret version; redeploy the bound Functions still false/false; prove allowed and mismatched callable behavior with zero sends; deploy Hosting while still disabled; activate digital true/service false; prove an arbitrary address still causes no send; separately approve and execute one Graph authentication-email dispatch; authenticate; and only then separately approve and execute one QuickBooks invoice email. Firebase documents that secret parameters check Secret Manager during deployment and that bound Functions must be redeployed after a new secret value: [Firebase secret parameters](https://firebase.google.com/docs/functions/config-env#secret_parameters).

## Send and webhook safety boundary

Invoice creation and invoice send are separate durable effects. A deterministic Accounting request ID and exact order reference prevent duplicate invoice creation. Each effect claim records a claim ID, claim time, and five-minute lease. A stale create claim may recover the exact Invoice before retry. A stale invoice-send claim is ambiguous: scheduled recovery moves it to `manual_review` with `invoice_send_unknown` and never blindly resends. A confirmed send response records only that QuickBooks accepted the send operation; it is neither inbox-delivery proof nor payment proof.

Webhooks are optional acceleration. The production app is visible, but its webhook endpoint is unconfigured and no change is authorized. This does not by itself block a digital pilot if the existing Accounting OAuth connection is authoritatively working and every identity, Rules, emulator, feature-flag, scoped-release, invoice, and payment gate passes. Scheduled reconciliation is not optional and may support that pilot without webhooks: it re-reads due nonterminal orders, recovers stale claims, and checks authoritative Invoice/Payment entities when webhooks are unavailable, delayed, duplicated, or missed.

## Release blockers and approval gates

- Keep production webhook configuration separate and unapproved. Before any future webhook change, verify the app/realm mapping, endpoint, and verifier-token secret boundary, review the exact change, and obtain Brian's approval.
- Preserve the recovered production Firestore source, merge the narrow commerce denies, install/verify Java and rules-unit-testing, and run the full signed-out/ordinary/admin emulator suite before any Rules mapping or release.
- Preserve the recovered production Storage source and verified bucket, approve and place the exact paid artifact under a reviewed private per-SKU object key, merge the direct-read denial, and pass signed-out/wrong-user/owner/admin emulator proof before any Storage mapping or release.
- Only after recovering and merging the authoritative Firestore source, add `"rules":"firestore.rules"` alongside the existing indexes mapping in `firebase.json`; only after the equivalent Storage recovery, add `"storage":{"rules":"storage.rules"}`. A missing or mismatched mapping blocks its dry run and release.
- Confirm Firebase email-link authentication is already enabled or obtain separate approval for that account configuration; prove verified-email UID binding, same-owner status, expired/replayed link denial, and single-use download-grant behavior before the pilot. Separately approve one Graph-delivered Firebase authentication email and its exact recipient; provider configuration and recipient-secret creation do not authorize it.
- Declare `COMMERCE_PILOT_RECIPIENT_EMAIL` with `defineSecret`, bind it only to the link request/dispatcher and digital-order Functions, and keep its value out of source, dotenv files, Firestore, logs, responses, evidence, and Hosting. Under its own approval, create the exact secret version while both flags are false, redeploy the bound Functions still false/false, and prove allowed/mismatched requests create no send while disabled.
- Test identical generic mismatch/approved results, mismatch/no-send, exactly one approved Graph send, duplicate/parallel suppression, ambiguous dispatch to manual review with no resend, verified-token allowlisting, exactly one recipient/SKU order/invoice, and separate authentication/invoice-email effect receipts before release.
- Keep both commerce feature flags false by default in the committed project parameter file. The pilot may change only `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED`; `COMMERCE_SERVICE_QBO_SEND_ENABLED` remains false until a separate service release. Record the reviewed config commit, deploy log showing the exact project file was loaded without prompting, and protected runtime readback.
- Confirm the current Invoice send request/response against official documentation in tests; do not invent a path, field, delivery receipt, or pay URL.
- Approve the exact SKU, price, QuickBooks item, tax treatment, scoped deploys, exact-recipient secret version, one Graph-delivered Firebase authentication email and its exact recipient, one later QuickBooks invoice send and its exact customer email recipient, one owner-controlled payment, and any refund as separate production actions.
- Keep fulfillment locked until Accounting Invoice and Payment evidence passes the exact normalized verifier.

## Official documentation consulted

- [QuickBooks Online Accounting API: Invoice](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice)
- [QuickBooks Online Accounting API: Payment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/payment)
- [QuickBooks Online webhooks](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks)
- [QuickBooks Online webhook best practices](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices)
- [QuickBooks Online OAuth 2.0](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [Official Intuit Developer QuickBooks Online Accounting API collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/overview)
- [Official Intuit Developer Accounting change-data-capture collection](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/folder/4884662-1a02fcdc-856f-42ee-92da-0513e0b6eca4)
- [Firebase: Configure the Cloud Functions environment](https://firebase.google.com/docs/functions/config-env)
- [Firebase Functions `defineBoolean` reference](https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.params#defineboolean)
- [Firebase Authentication: Email-link sign-in for web](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Firebase Authentication: Generate email action links with the Admin SDK](https://firebase.google.com/docs/auth/admin/email-action-links)
- [Firebase Admin Node: `BaseAuth.generateSignInWithEmailLink`](https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.baseauth#baseauthgeneratesigninwithemaillink)

These sources define technical capabilities. The merchant state, enabled methods, displayed rates, and invisible-app finding above come only from the authorized signed-in views and are not inferred from public documentation.

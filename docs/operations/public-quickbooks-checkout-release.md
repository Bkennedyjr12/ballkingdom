# Public QuickBooks Checkout — Inactive Release Packet

**Prepared:** 2026-09-01

**Repository:** `Bkennedyjr12/ballkingdom`

**Feature branch:** `feature/public-commerce-launch`

**Pre-feature merge commit:** `ec03ffeebdf5307d0dafb619f1645ffe93446af7`

**Firebase project:** `the-ballers-kingdom`

**Firebase account:** `lilpelejr12@gmail.com`

**Hosting target/site:** `public` → `ballkingdom-com`

## Release decision

This packet is ready only for an **inactive, scoped deployment review**. It does not authorize
deployment, an invoice, an email, a payment, a refund, a QuickBooks setting change, or public
activation.

The committed state remains fail-closed:

- `COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=false`
- `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false`
- `COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED=false`
- `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`
- configured Payments capability fields remain false until the separately reviewed activation
  commit;
- the Home Inspection Study Guide catalog item remains `active:false` and
  `release.deployApproved:false`;
- no browser or Hosting page handles payment credentials.

## QuickBooks capability evidence

An authorized read-only review of the signed-in production company on 2026-09-01 confirmed:

- company `The Ballers Kingdom` and its selected QuickBooks Payments merchant account;
- active merchant details, deposit configuration, processing limits, and standard card/bank
  deposit speeds;
- invoice defaults `Accept Credit Cards: On`, `Accept ACH: On`, and `Accept PayPal: On`;
- merchant Payment Methods `Cards` and `PayPal and Venmo`;
- online invoice email delivery to a customer's saved email address;
- item ID `8`, `Home Inspection Study Guide`, `$49.00`, income account `Services`, and UI tax
  category `Nontaxable`, corresponding to the reviewed Accounting invoice code `NON`;
- no surcharge control or enabled surcharge state was observed on the representative
  invoice-payment path. This is not global proof. Intuit says surcharging disables Apple Pay, so
  Apple Pay must be visibly confirmed on the controlled owner invoice before activation. When
  available, it is conditionally presented through the card option for Safari on an eligible Apple
  device with an eligible card; it is not a separate website integration or device guarantee.

No setting was edited, no invoice was created or sent, and no provider write occurred.

## Exact reviewed Function inventory

The source exports 25 deployed-function candidates. The scoped release allowlist is the following
24 and deliberately excludes `confirmAcceptedBooking`:

```text
requestPilotSignInLink,requestOwnerPilotSignInLink,createDigitalOrder,
createControlledOwnerPilotOrder,getOrderStatus,createDownloadGrant,
redeemDownloadGrant,getBuyerCommerceCapability,verifyOrderPayment,getCommerceReleaseState,
resolvePublicAuthEmailQuarantine,getQuickBooksCommerceHealth,
requestRefundReview,reconcileOrder,reconcileRefund,quickBooksCommerceWebhook,
reconcileCommerceOrders,dispatchCommerceEffects,stageInvoiceApprovals,approveInvoice,
beginQuickBooksConnection,quickBooksOAuthCallback,beginMicrosoftConnection,
microsoftOAuthCallback
```

The retained public callable name `requestPilotSignInLink` is a compatibility export; its
implementation now routes the public sign-in request and no longer restricts the digital path to
one owner email. No renamed deployment export is required.

## Inactive scoped deployment manifest

These commands are documentation only. They were not executed by Task 6. The expected dry run and
deployment must load `functions/.env.the-ballers-kingdom` without prompting and must keep all four
flags false.

The cleanup queries used by `dispatchCommerceEffects` require the committed composite indexes.
Deploy and verify indexes as a separately approved first step. Do not start the inactive Function
deployment until the Firebase CLI reports the index release complete:

```bash
firebase deploy --only firestore:indexes \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run

firebase deploy --only firestore:indexes \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

If cleanup still reports an index/read failure, the scheduled dispatcher records the redacted
`public_auth_cleanup_unavailable` alert and continues effect dispatch and Accounting reconciliation;
cleanup never becomes a single point of failure for an already-paid customer.

```bash
firebase deploy --only functions:requestPilotSignInLink,functions:requestOwnerPilotSignInLink,functions:createDigitalOrder,functions:createControlledOwnerPilotOrder,functions:getOrderStatus,functions:createDownloadGrant,functions:redeemDownloadGrant,functions:getBuyerCommerceCapability,functions:verifyOrderPayment,functions:getCommerceReleaseState,functions:resolvePublicAuthEmailQuarantine,functions:getQuickBooksCommerceHealth,functions:requestRefundReview,functions:reconcileOrder,functions:reconcileRefund,functions:quickBooksCommerceWebhook,functions:reconcileCommerceOrders,functions:dispatchCommerceEffects,functions:stageInvoiceApprovals,functions:approveInvoice,functions:beginQuickBooksConnection,functions:quickBooksOAuthCallback,functions:beginMicrosoftConnection,functions:microsoftOAuthCallback,hosting:public \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run

firebase deploy --only functions:requestPilotSignInLink,functions:requestOwnerPilotSignInLink,functions:createDigitalOrder,functions:createControlledOwnerPilotOrder,functions:getOrderStatus,functions:createDownloadGrant,functions:redeemDownloadGrant,functions:getBuyerCommerceCapability,functions:verifyOrderPayment,functions:getCommerceReleaseState,functions:resolvePublicAuthEmailQuarantine,functions:getQuickBooksCommerceHealth,functions:requestRefundReview,functions:reconcileOrder,functions:reconcileRefund,functions:quickBooksCommerceWebhook,functions:reconcileCommerceOrders,functions:dispatchCommerceEffects,functions:stageInvoiceApprovals,functions:approveInvoice,functions:beginQuickBooksConnection,functions:quickBooksOAuthCallback,functions:beginMicrosoftConnection,functions:microsoftOAuthCallback,hosting:public \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

The Function/Hosting manifest excludes Firestore Rules, Storage Rules, the redirect site, and
`confirmAcceptedBooking`. Actual deployment requires explicit action-time approval.

## Post-inactive-deploy QuickBooks health gate

Before any authentication email, order, Customer, or Invoice, an authenticated administrator with
the `admin:true` claim and valid App Check must invoke the deployed read-only Accounting callable
`getQuickBooksCommerceHealth`. The callable must complete all of the following without exposing
credential values:

1. Read the exact refresh-token and realm versions pinned by the published credential binding; ignore later
   unreferenced or orphan Secret Manager versions.
2. Run one bounded refresh through the deployed credential coordinator.
3. Prove refresh continuity with post-refresh binding and exact-version readback. If
   Intuit returns the unchanged token, report `rotationPersisted=false`; if Intuit returns a
   replacement, exact-write and read back its enabled version and publish that version before
   reporting `rotationPersisted=true`.
4. Use the verified access credential for a bounded Accounting read of the exact realm and require
   `CompanyInfo.CompanyName='The Ballers Kingdom'`.

Missing metadata, refresh failure, ambiguous persistence, realm mismatch, or company-name mismatch
fails closed. Its response is limited to a status and redacted booleans; it returns no realm, version,
company name, token, provider body, or credential material. The bounded OAuth refresh may rotate the
refresh token; only that conditional credential rotation is persisted. It performs no email, order,
Customer, or Invoice mutation.

After this health gate and every remaining activation gate passes, activate
`COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=true` and
`COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=true` together in one reviewed activation commit;
`COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED` must be false before public activation and
`COMMERCE_SERVICE_QBO_SEND_ENABLED` remains false.

## Controlled owner purchase while public checkout is inactive

The inactive deployment includes two separately named callables that the public browser never
uses: `requestOwnerPilotSignInLink` and `createControlledOwnerPilotOrder`. Both remain inert while
`COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED=false`. The sign-in callable compares only the exact
Secret Manager owner email and returns the generic public response. Order creation additionally
requires the authoritative Firebase UID, the same exact verified email, and the administrator-
issued `companionOwner:true` claim on both the current token and the current Admin user record.

The staged owner proof sequence is:

1. Keep both public flags and the service flag false. Complete the inactive index/Function/Hosting
   deployment and the redacted QuickBooks health gate.
2. In a focused reviewed pilot commit, set the complete Payments capability record to the exact
   values listed below and set only `COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED=true`. Keep the public
   catalog item `active:false` and `release.deployApproved:false`.
3. After separate deploy approval, deploy only `requestOwnerPilotSignInLink` and
   `createControlledOwnerPilotOrder` with the explicit project/account. Read back that both public
   flags and the service flag remain false and the controlled-owner flag alone is true.
4. Stop for exact transaction approval, then perform at most one owner sign-in email, one $49
   Invoice send, one payment, one Accounting reconciliation, and one protected download.
5. Immediately set `COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED=false` in a reviewed commit and redeploy
   the same two callables. Verify all four runtime flags have the intended inactive values before
   preparing public activation. No public caller can use the owner path.

No owner email, UID, invoice number, or payment identifier belongs in this packet or release logs.

## Exact public activation state

The server has one regression-tested activation predicate. Public capability and ordering become
active only when this exact reviewed combination is true at the same commit:

```text
COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=true
COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=true
COMMERCE_CONTROLLED_OWNER_PILOT_ENABLED=false
COMMERCE_SERVICE_QBO_SEND_ENABLED=false

PAYMENTS_CAPABILITY.accounting=true
PAYMENTS_CAPABILITY.payments=true
PAYMENTS_CAPABILITY.mode=documented-intuit-flow
PAYMENTS_CAPABILITY.supportsImmediatePayment=true
PAYMENTS_CAPABILITY.supportsCards=true
PAYMENTS_CAPABILITY.supportsApplePay=true
PAYMENTS_CAPABILITY.supportsPayPal=true
PAYMENTS_CAPABILITY.supportsAch=true
PAYMENTS_CAPABILITY.supportsWebhooks=true
PAYMENTS_CAPABILITY.surchargingEnabled=false
PAYMENTS_CAPABILITY.onlineInvoiceDelivery=true

Home Inspection Study Guide active=true
release.ownerPilotApproved=true
release.priceApproved=true
release.fulfillmentRuntimeVerified=true
release.deployApproved=true
protected fulfillment runtime available=true
```

Any false, missing, non-Boolean, or renamed required state remains inactive. Additional metadata
cannot substitute for a required field. The activation
commit must show the two public flags, every Payments capability Boolean, `active:true`, and
`release.deployApproved:true` together against this list; it must not enable the controlled-owner
or service lanes.

## Emergency disable and customer-preserving selective rollback

Emergency response starts by disabling public ordering, not by deleting Functions:

1. For an emergency disable, set `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false`, keep
   `COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=true`, and keep
   `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`. This blocks new orders while preserving public
   authentication and resume for existing paid customers.
2. Commit and review that fail-closed configuration change.
3. Redeploy the exact 24-Function allowlist above with `hosting:public`, the explicit project and
   account, then read back the runtime release state and verify the disabled browser behavior.
4. Reconcile any already-created order using authoritative QuickBooks Invoice/Payment evidence;
   do not resend an ambiguous email or invoice effect.

Do not redeploy the full pre-feature Function surface: that would strand customers who already paid.
Retain `requestPilotSignInLink` for returning-customer authentication, retain `getOrderStatus`, retain
`createDownloadGrant`, and retain `redeemDownloadGrant`. Also retain authoritative reconciliation and
payment-verification Functions until every in-flight paid order is resolved.

If a code regression requires rollback, create a reviewed recovery commit from the last deployed
public-commerce commit, keep the public flag false, revert only the defective mutation or Hosting
change, and deploy only those reviewed affected targets. Verify existing authenticated owners can
read status and redeem a fresh single-use grant before considering any Function deletion. Preserve
orders, reservations, effect receipts, payment evidence, and grant-consumption records.

Function deletion is not an automatic rollback step. It is a separate destructive action requiring
exact-name, exact-region action-time approval, and it cannot occur while an existing customer's
authentication, status, reconciliation, or protected-download recovery depends on that Function.

## Verification record

The complete gate ran under Node `v22.23.2` on 2026-09-01. The emulator command specified project
`the-ballers-kingdom` and account `lilpelejr12@gmail.com`, started only the local Firestore and
Storage emulators, and made no mail, invoice, payment, refund, or provider mutation.

| Control | Result |
| --- | --- |
| Locked installs | Root: 18 packages; Functions: 334 packages |
| Storefront unit/content | 35 passed; 0 failed/skipped |
| Storefront browser | 4 passed; 0 failed/skipped |
| Protected-commerce browser | 34 passed; 0 failed/skipped |
| Functions without emulators | 507 tests; 505 passed; 2 documented emulator-only skips; 0 failed |
| Functions syntax | passed |
| Firestore + Storage emulator matrix | 507 passed; 0 failed/skipped |
| Root production dependency audit | 0 vulnerabilities |
| Functions production dependency audit | 7 moderate transitive findings; 0 high/critical |
| Repository security scan | no production credential confirmed; fixture and public Firebase/App Check configuration matches classified below |
| Patch integrity | `git diff --check` clean |

The seven moderate findings are one upstream `uuid <11.1.1` advisory
(`GHSA-w5hq-g745-h8pq`) propagated through `gaxios`, `teeny-request`, `retry-request`,
`@google-cloud/storage`, `firebase-admin`, and `firebase-functions`. npm proposes a breaking forced
change to `firebase-admin@10.3.0`, which would downgrade the supported direct dependency and was not
applied. The inactive release remains fail-closed; this transitive dependency is accepted for this
packet with no high or critical finding and must be retested when its supported upstream chain ships
a fix.

The repository checker findings are synthetic test tokens/IDs used to prove redaction and the public
Firebase web configuration plus public reCAPTCHA Enterprise site key required by the browser. No
private key, OAuth secret, refresh token, bearer token, customer payment data, or production
credential was confirmed. No green result is treated as production confirmation; provider truth
above came from the separate signed-in QuickBooks views.

## Scope rulings and residual risks

- **Ruling:** Firebase App Check `appId` identifies the registered web app, not a browser device or
  installation. Public auth therefore uses email-digest, trusted-IP, and one app-global dimension;
  no spoofable browser-generated device ID is accepted. Firebase App Check enforcement, managed
  platform quotas, and operator monitoring remain the edge controls. **Cost if wrong:** a
  distributed valid-App-Check attack can exhaust the app-global fail-closed breaker and temporarily
  delay sign-in mail; it cannot create an invoice, expose an address, or bypass the explicit flags.
- **Ruling:** An ambiguous public sign-in delivery creates a stable hash-only quarantine for the
  recipient/SKU/purpose, independent of issuance bucket. Only the admin/App-Check-protected
  `resolvePublicAuthEmailQuarantine` operation can clear it after investigation. **Cost if wrong:**
  a false ambiguity can block that recipient until an administrator resolves it, favoring no
  duplicate email over availability.
- **Ruling:** Customer and Invoice mutation timeouts use redacted `PROVIDER_TIMEOUT` internally.
  A potentially committed mutation proceeds only after exact Customer-email or Invoice-private-note
  readback; unresolved or multiple evidence is terminal manual review. **Cost if wrong:** eventual
  provider consistency may require manual reconciliation, but the system does not blindly create a
  second Customer or Invoice.

- **Ruling:** Public authentication/resume and new ordering require separate server-owned flags.
  Activation turns both on together; emergency disable leaves authentication on while turning ordering
  off so existing paid customers retain status and download recovery. **Cost if wrong:** a mistaken
  auth-only activation could permit bounded generic sign-in-email requests while ordering remains off;
  App Check, fixed-key rate limits, authoritative-user checks, and generic responses remain enforced.
- **Ruling:** The health callable's forced OAuth refresh is a narrowly required credential operation,
  not an Accounting entity mutation. It must prove refresh continuity; an unchanged token reports
  `rotationPersisted=false`, while a replacement reports true only after exact persistence,
  publication, and readback. **Cost if wrong:** interruption or ambiguous
  persistence fails closed, records manual-review evidence, and may require owner reconnect; no email,
  order, Customer, Invoice, payment, or refund operation is attempted.
- **Ruling:** Opening QuickBooks edit panels solely to read their current values is read-only because
  no field was changed and every panel was canceled or abandoned without Save. **Cost if wrong:** an
  unexpected provider autosave could alter merchant state; no autosave or changed state was observed.
- **Ruling:** QuickBooks UI label `Nontaxable` plus the reviewed invoice contract's exact
  `TaxCodeRef.value='NON'` is sufficient release evidence for item 8. **Cost if wrong:** a future QBO
  UI/API mapping change could require a fresh Accounting read before activation.
- **Ruling:** Apple Pay is a conditional QuickBooks e-invoice method, not a separately enabled
  website method. Absence of a surcharge control in the observed representative path is not global
  proof; controlled-owner invoice visibility is the activation proof. **Cost if wrong:** activation
  stops if Apple Pay is missing, while customers may still differ by device, browser, or card.
- No tax-professional conclusion is made outside the owner's accepted nationwide residual-risk
  decision. California accountant confirmation and the electronic-only/no-tangible-copy constraint
  remain the recorded basis.

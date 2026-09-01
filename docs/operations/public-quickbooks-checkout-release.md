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

- `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false`
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
- no surcharge control or surcharge state on the representative invoice-payment path. Apple Pay
  is therefore conditionally presented by QuickBooks through the enabled card option when the
  customer uses Safari on an eligible Apple device with an eligible card. It is not a separate
  website integration and is never guaranteed for every device.

No setting was edited, no invoice was created or sent, and no provider write occurred.

## Exact reviewed Function inventory

The source exports 21 deployed-function candidates. The scoped release allowlist is the following
20 and deliberately excludes `confirmAcceptedBooking`:

```text
requestPilotSignInLink,createDigitalOrder,getOrderStatus,createDownloadGrant,
redeemDownloadGrant,getBuyerCommerceCapability,verifyOrderPayment,getCommerceReleaseState,
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
deployment must load `functions/.env.the-ballers-kingdom` without prompting and must keep both
flags false.

```bash
firebase deploy --only functions:requestPilotSignInLink,functions:createDigitalOrder,functions:getOrderStatus,functions:createDownloadGrant,functions:redeemDownloadGrant,functions:getBuyerCommerceCapability,functions:verifyOrderPayment,functions:getCommerceReleaseState,functions:requestRefundReview,functions:reconcileOrder,functions:reconcileRefund,functions:quickBooksCommerceWebhook,functions:reconcileCommerceOrders,functions:dispatchCommerceEffects,functions:stageInvoiceApprovals,functions:approveInvoice,functions:beginQuickBooksConnection,functions:quickBooksOAuthCallback,functions:beginMicrosoftConnection,functions:microsoftOAuthCallback,hosting:public \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run

firebase deploy --only functions:requestPilotSignInLink,functions:createDigitalOrder,functions:getOrderStatus,functions:createDownloadGrant,functions:redeemDownloadGrant,functions:getBuyerCommerceCapability,functions:verifyOrderPayment,functions:getCommerceReleaseState,functions:requestRefundReview,functions:reconcileOrder,functions:reconcileRefund,functions:quickBooksCommerceWebhook,functions:reconcileCommerceOrders,functions:dispatchCommerceEffects,functions:stageInvoiceApprovals,functions:approveInvoice,functions:beginQuickBooksConnection,functions:quickBooksOAuthCallback,functions:beginMicrosoftConnection,functions:microsoftOAuthCallback,hosting:public \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

This manifest excludes Firestore Rules, Storage Rules, indexes, the redirect site, and
`confirmAcceptedBooking`. Actual deployment requires explicit action-time approval.

## Emergency disable and rollback

Emergency response starts by disabling public ordering, not by deleting Functions:

1. Set only `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false`; keep
   `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`.
2. Commit and review that fail-closed configuration change.
3. Redeploy the exact 20-Function allowlist above with `hosting:public`, the explicit project and
   account, then read back the runtime release state and verify the disabled browser behavior.
4. Reconcile any already-created order using authoritative QuickBooks Invoice/Payment evidence;
   do not resend an ambiguous email or invoice effect.

If code rollback is required, build a clean detached worktree at the pre-feature merge commit and
verify it before deploying the pre-feature surface:

```bash
git worktree add --detach /private/tmp/ballkingdom-public-checkout-rollback \
  ec03ffeebdf5307d0dafb619f1645ffe93446af7
cd /private/tmp/ballkingdom-public-checkout-rollback
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm ci
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix functions ci

firebase deploy --only functions:requestPilotSignInLink,functions:createDigitalOrder,functions:getOrderStatus,functions:createDownloadGrant,functions:redeemDownloadGrant,functions:getBuyerCommerceCapability,functions:verifyOrderPayment,functions:getCommerceReleaseState,functions:requestRefundReview,functions:reconcileOrder,functions:reconcileRefund,functions:quickBooksCommerceWebhook,functions:reconcileCommerceOrders,functions:dispatchCommerceEffects,functions:stageInvoiceApprovals,functions:approveInvoice,functions:beginQuickBooksConnection,functions:quickBooksOAuthCallback,functions:beginMicrosoftConnection,functions:microsoftOAuthCallback,hosting:public \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

If the pre-feature source does not export a feature Function, removing that deployed Function is a
separate destructive action. `firebase functions:delete` is intentionally omitted from the automatic
rollback sequence and requires exact-name, exact-region action-time approval.

## Verification record

The complete gate ran under Node `v22.23.2` on 2026-09-01. The emulator command specified project
`the-ballers-kingdom` and account `lilpelejr12@gmail.com`, started only the local Firestore and
Storage emulators, and made no mail, invoice, payment, refund, or provider mutation.

| Control | Result |
| --- | --- |
| Locked installs | Root: 18 packages; Functions: 334 packages |
| Storefront unit/content | 25 passed; 0 failed/skipped |
| Storefront browser | 4 passed; 0 failed/skipped |
| Protected-commerce browser | 34 passed; 0 failed/skipped |
| Functions without emulators | 486 tests; 484 passed; 2 documented emulator-only skips; 0 failed |
| Functions syntax | passed |
| Firestore + Storage emulator matrix | 486 passed; 0 failed/skipped |
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

- **Ruling:** Opening QuickBooks edit panels solely to read their current values is read-only because
  no field was changed and every panel was canceled or abandoned without Save. **Cost if wrong:** an
  unexpected provider autosave could alter merchant state; no autosave or changed state was observed.
- **Ruling:** QuickBooks UI label `Nontaxable` plus the reviewed invoice contract's exact
  `TaxCodeRef.value='NON'` is sufficient release evidence for item 8. **Cost if wrong:** a future QBO
  UI/API mapping change could require a fresh Accounting read before activation.
- **Ruling:** Apple Pay is a conditional consequence of QuickBooks card-enabled e-invoices with no
  surcharge, not a separately enabled website method. **Cost if wrong:** a customer may not see Apple
  Pay on an ineligible device, browser, or card; the storefront explicitly discloses this condition.
- No tax-professional conclusion is made outside the owner's accepted nationwide residual-risk
  decision. California accountant confirmation and the electronic-only/no-tangible-copy constraint
  remain the recorded basis.

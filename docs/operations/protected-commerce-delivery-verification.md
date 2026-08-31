# Protected commerce delivery verification

Status: **pre-release verification completed; purchase activation remains blocked**

Reviewed: 2026-08-31  
Verified implementation commit: `20d0bad2ed36a9f77969c03c209d2f73c900d584`  
Production project/account: `the-ballers-kingdom` / `lilpelejr12@gmail.com`

This record covers the inactive protected-download runtime only. It does not authorize or
record a customer order, authentication email, QuickBooks customer/invoice/payment/refund,
invoice email, or other provider-side commerce action.

## Verification results

| Control | Evidence | Result |
|---|---|---|
| Node runtime | `/opt/homebrew/opt/node@22/bin/node --version` | `v22.23.2` |
| Storefront unit/content | `npm run test:storefront:unit` | 21 passed; 0 failed/skipped |
| Storefront browser | `npm run test:storefront:browser` | 4 passed; 0 failed/skipped |
| Functions without emulators | `npm test` in `functions/` | 400 tests; 398 passed; 2 documented emulator-only skips; 0 failed |
| Functions syntax | `npm run check` in `functions/` | passed |
| Rules/emulator matrix | Firestore and Storage emulators with the complete Functions suite | 400 tests; 400 passed; 0 failed/skipped |
| Root production dependencies | `npm audit --omit=dev` | 0 vulnerabilities |
| Functions production dependencies | `npm audit --omit=dev` | 7 moderate transitive findings; 0 high/critical |
| Patch integrity | `git diff --check` | clean |
| Repository security scan | secure operator checker | no production credential confirmed; fixture/public-config matches classified below |
| Hosting package | explicit `hosting:public` dry run | passed; no deployment performed |

The first emulator attempt could not find the macOS Java runtime. Re-running with the
already-installed Homebrew OpenJDK 21 binary on `PATH` completed the matrix. Firebase Auth
is not initialized in the local emulator configuration and was therefore not started. The
Functions emulator also timed out while discovering the full function bundle under the host's
global Node 25; the test process itself used Node 22 and the Firestore/Storage Rules tests
executed against their emulators. No test contacted a mail, QuickBooks, payment, or refund
provider.

The public browser configuration provenance was the Firebase Web App registered inside
`the-ballers-kingdom`, retrieved with the explicit Ballers Kingdom account. The reCAPTCHA
Enterprise key was read back through the corresponding Firebase App Check registration and
canonical-domain allowlist. This evidence intentionally records neither public identifier's
value nor raw CLI output.

## Security and packaging controls

- Firebase Hosting serves the repository root, so its explicit ignore list is the release
  boundary. It excludes the private paid PDF, `functions/**`, `tests/**`, Rules and index
  files, `docs/**`, Firebase/local metadata, dependency trees, reports, source inputs, audit
  files, and development configuration. A scoped dry run for `hosting:public` completed.
- `functions/.env.the-ballers-kingdom` was read back without secret output. It pins
  `COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=false` and
  `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`.
- The server catalog remains `active:false`, `tax.accountantVerified:false`,
  `release.fulfillmentRuntimeVerified:false`, and `release.deployApproved:false`; its
  computed buyer capability is inactive.
- Tracked-file checks found no `.secret.local`, Firebase/debug log, private Storage download
  URL, or email action link. Token/grant-like matches are synthetic test fixtures and the
  approved design text. The Firebase browser module contains only the provider-required
  public Web App/reCAPTCHA identifiers retrieved for the selected Web App; no private key or
  bearer credential is stored.
- The secure repository checker reported only synthetic token strings in tests and the
  expected public Firebase Web configuration. No secret was accepted by classification.
- Direct Storage Rules deny `private-commerce/**`; the emulator matrix exercised signed-out,
  authenticated, owner, and administrator denial while preserving unrelated retained rules.

## Private artifact comparison

The provider metadata readback used the immutable generation and explicit project/account.
No signed or public URL was generated.

| Field | Frozen source/catalog | Provider readback | Result |
|---|---:|---:|---|
| Bucket | `the-ballers-kingdom.firebasestorage.app` | same | match |
| Object key | `private-commerce/home-inspection-study-guide/guide-v1.pdf` | same | match |
| Generation | `1788191152627469` | same | match |
| Size | 71,250,419 bytes | 71,250,419 bytes | match |
| Content type | `application/pdf` | `application/pdf` | match |
| MD5 (base64) | `XXzfi6ddgB6rru9fLIrv7Q==` | same | match |
| SHA-256 | `2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d` | independently recomputed from source | match |

## Dependency advisory disposition

The root production tree has zero findings. The Functions production tree has seven moderate
findings under the transitive `firebase-admin` to Google Cloud Storage chain for
`GHSA-w5hq-g745-h8pq`; there are no high or critical findings. The installed direct Firebase
packages are current for this branch. npm's only complete automated remediation proposes the
breaking downgrade to `firebase-admin@10.3.0`, so it was not applied during evidence work.
The product and both send flags remain inactive while the upstream dependency chain is
tracked. Any supported dependency update must be tested through this full gate before release.

## Scoped release manifest (not executed by Task 5)

The reviewed Functions inventory is exactly these 20 exports:

```text
requestPilotSignInLink,createDigitalOrder,getOrderStatus,getBuyerCommerceCapability,
verifyOrderPayment,getCommerceReleaseState,requestRefundReview,reconcileOrder,
reconcileRefund,quickBooksCommerceWebhook,reconcileCommerceOrders,
dispatchCommerceEffects,stageInvoiceApprovals,approveInvoice,
beginQuickBooksConnection,quickBooksOAuthCallback,beginMicrosoftConnection,
microsoftOAuthCallback,createDownloadGrant,redeemDownloadGrant
```

`confirmAcceptedBooking` is explicitly excluded. Task 6 may deploy only this function
allowlist plus `hosting:public`, always with `--project the-ballers-kingdom` and
`--account lilpelejr12@gmail.com`. It must not deploy Firestore, Storage Rules, indexes, or
the redirect site as part of this release.

## Rollback procedure

Rollback must use the last reviewed pre-feature main commit
`724fc0594d1862b49f8ba6c148c12b2272198df8` in a clean detached worktree. After locked
dependency installation and focused verification, redeploy the prior 18-function allowlist
and `hosting:public` with the same explicit project/account. Then delete only
`createDownloadGrant` and `redeemDownloadGrant` in `us-west1` using the explicit project and
account. These are documented operator commands, not commands executed during Task 5.

```bash
git worktree add --detach /private/tmp/ballkingdom-protected-rollback \
  724fc0594d1862b49f8ba6c148c12b2272198df8
cd /private/tmp/ballkingdom-protected-rollback
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm ci
cd functions
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm ci
cd ..

firebase deploy --only \
functions:requestPilotSignInLink,functions:createDigitalOrder,functions:getOrderStatus,functions:getBuyerCommerceCapability,functions:verifyOrderPayment,functions:getCommerceReleaseState,functions:requestRefundReview,functions:reconcileOrder,functions:reconcileRefund,functions:quickBooksCommerceWebhook,functions:reconcileCommerceOrders,functions:dispatchCommerceEffects,functions:stageInvoiceApprovals,functions:approveInvoice,functions:beginQuickBooksConnection,functions:quickBooksOAuthCallback,functions:beginMicrosoftConnection,functions:microsoftOAuthCallback,hosting:public \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com

firebase functions:delete createDownloadGrant redeemDownloadGrant --region us-west1 \
  --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

Function deletion is destructive and requires action-time confirmation even though the
rollback procedure is pre-documented.

## Remaining activation gates

1. A qualified accountant must verify the exact electronic-only tax treatment and matching
   QuickBooks tax code.
2. A separately reviewed release must deliberately set fulfillment-runtime and deployment
   approval gates; this verification does not set them.
3. Product `active` and the digital invoice pilot flag must remain false until a separately
   approved live-pilot sequence is ready.
4. A live release needs independent function-state, Hosting/header, immutable-object,
   unauthenticated, wrong-origin, and direct-Storage denial readback.
5. A real customer/authentication email, QuickBooks mutation, payment, refund, or invoice
   email always requires separate action-time authorization.

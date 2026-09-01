# Whole-branch review fix — round 1 report

**Branch:** `feature/public-commerce-launch`

**Base:** `bb66692`

**Date:** 2026-09-01

**Scope:** local implementation and verification only. No push, deploy, browser-account operation,
provider write, message, invoice, payment, or refund occurred.

## Result

All six Important whole-branch findings are addressed. The committed configuration remains fully
inactive: public authentication/resume, public digital checkout, the controlled-owner lane, and the
service QuickBooks send lane are false; the catalog and release activation gates remain false.

## Finding disposition

1. **Firestore indexes and cleanup isolation — fixed.** The inactive manifest deploys and verifies
   `firestore:indexes` as a separately approved prerequisite. Cleanup/index failure now emits only a
   redacted alert and cannot stop due-effect dispatch or Accounting reconciliation.
2. **QuickBooks timeout and mutation ambiguity — fixed.** Real Accounting aborts map to redacted
   `PROVIDER_TIMEOUT`. A timed-out Customer POST may continue only after one exact bounded email
   readback; a timed-out Invoice POST may continue only after one exact deterministic private-note
   readback. Missing, malformed, or multiple evidence is terminal manual review and never a blind
   retry.
3. **Controlled owner proof — fixed.** Two separately named callables remain disabled behind the
   default-false owner flag. They require the protected exact owner identity plus matching
   `companionOwner:true` claims in both the current token and current Admin user record. The public
   browser has no route to these callables. The staged enable, single-transaction approval stop, and
   immediate disable sequence is recorded in the release packet.
4. **Exact activation tuple — fixed.** One regression-tested predicate requires both public flags,
   every reviewed Payments capability Boolean/mode, fulfillment runtime, the catalog active gate,
   and every release gate. It also requires the controlled-owner and service lanes to remain false.
5. **Rate dimensions — fixed.** App Check `appId` is now explicitly an app-global dimension, not a
   device identifier. Email digest, trusted IP, and app-global budgets are independently consumed.
   No spoofable browser-generated installation ID was introduced. Managed App Check/quota/monitoring
   remain documented edge controls.
6. **Durable authentication ambiguity quarantine — fixed.** The recipient/SKU/purpose binding is a
   stable hash independent of issuance bucket. A later bucket cannot resend while the quarantine is
   active. Only the admin/App-Check-protected resolution operation can clear it after investigation;
   Firestore persists no raw recipient email.

## Compatibility and privacy reassessment

- Existing public callable naming remains compatible through `requestPilotSignInLink`; public and
  owner-only operations use separate server routes.
- The historical digital reservation namespace is preserved so a controlled-owner transaction and
  later public activation cannot create parallel reservations for the same buyer/SKU.
- Public API responses remain allowlisted and contain no email, provider identifier, provider body,
  token, realm, invoice number, or payment identifier.
- Rate and quarantine persistence uses fixed-length digests and safe operational codes. The explicit
  quarantine-resolution audit records only the admin UID and hash binding.
- Existing paid-customer auth, status, reconciliation, grant, and redemption paths remain available
  during the documented customer-preserving ordering disable.

## Verification evidence

| Gate | Result |
| --- | --- |
| Changed-scope focused regression | 258 passed, including 96 QuickBooks provider/Invoice tests |
| Full Functions, Node 22 | 507 tests: 505 passed, 2 emulator-only skipped, 0 failed |
| Firestore + Storage emulators | 507 passed, 0 skipped/failed; explicit project/account |
| Storefront unit/content | 35 passed |
| Storefront browser | 4 passed |
| Protected-commerce browser | 34 passed |
| Firebase browser runtime | 9 passed |
| Functions syntax / patch integrity | passed / clean |
| Root production audit | 0 vulnerabilities |
| Functions production audit | 7 moderate transitive; 0 high/critical |
| Security checker | only classified synthetic fixtures/public Firebase configuration |

The Functions audit remains the previously documented upstream `uuid <11.1.1` chain. npm's forced
repair would downgrade the supported direct Firebase dependency and was not applied. The security
checker matches synthetic test credentials and public Firebase/App Check browser configuration; no
production private credential was confirmed.

## Residual costs

- App-global fail-closed exhaustion can temporarily delay sign-in mail during distributed
  valid-App-Check abuse. It cannot activate checkout or create an Invoice by itself.
- A false ambiguous-send classification blocks one recipient/SKU/purpose until explicit admin
  resolution. This intentionally favors no duplicate email over availability.
- Provider eventual consistency after a potentially committed Customer/Invoice mutation may require
  manual Accounting reconciliation. Automatic duplicate mutation is prohibited.
- The controlled-owner proof deliberately requires a current dual claim and exact identity; stale
  authorization fails closed and must be corrected administratively before the one approved proof.

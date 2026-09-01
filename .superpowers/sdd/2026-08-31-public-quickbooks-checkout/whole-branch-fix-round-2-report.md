# Whole-branch review fix — round 2 report

**Branch:** `feature/public-commerce-launch`

**Base:** `71e064c`

**Date:** 2026-09-01

**Scope:** isolated local implementation and verification only. No push, deploy, provider write,
browser-account action, message, invoice, payment, or refund occurred.

## Result

All three Important round-two findings are addressed. The committed configuration remains inactive:
all four commerce flags, Payments capability booleans, catalog activation, and deploy approval remain
false.

## Finding disposition

1. **Service Invoice mutation ambiguity — fixed.** `PROVIDER_TIMEOUT`,
   `QBO_CUSTOMER_AMBIGUOUS`, and `QBO_INVOICE_AMBIGUOUS` now terminally quarantine the service order
   and create effect. A later approval call observes manual review and makes no second provider
   mutation. An unclassified pre-commit failure remains retryable for compatibility.
2. **Operative Task 7 drift — fixed.** The approved plan and release packet now share the exact
   current 24-Function allowlist, index-first deployment/readback, four inactive flags, controlled-
   owner enable/proof/disable sequence, full Payments/catalog/fulfillment activation tuple, and
   customer-preserving selective rollback. One regression compares the byte-identical manifest and
   every required activation state across both documents.
3. **Public stale-effect recovery — fixed.** Exact production public flags activate scheduled
   handling without the legacy owner alias. The background worker may complete `invoice_create` only
   from persisted provider-safe references plus exact authoritative Invoice evidence. It cannot read
   the protected owner email and never persists a customer email. Missing references, mismatched
   evidence, or email-dependent send work becomes terminal manual review with a redacted alert. A
   post-dispatch stale send is never resent.

## Compatibility and privacy

- Controlled-owner behavior and the legacy test compatibility alias remain isolated from the exact
  production-public flag fixture.
- Existing provider-safe reference recovery remains idempotent and performs no new Customer or
  Invoice mutation.
- Unclassified pre-commit service failures retain bounded retry behavior.
- Persisted orders contain the fixed-length recipient binding and server-owned customer name only;
  tests prove no raw recipient email enters stale-recovery state.
- `supportsWebhooks=true` records provider-account capability only. It does not activate or prove
  ingestion; scheduled authoritative Accounting reconciliation remains required.

## Verification

| Gate | Result |
| --- | --- |
| Changed-scope focused | 126 passed |
| Full Functions, Node 22 | 513 tests: 511 passed, 2 emulator-only skipped, 0 failed |
| Firestore + Storage emulators | 513 passed, 0 skipped/failed; explicit project/account |
| Storefront unit/content | 36 passed |
| Storefront browser | 4 passed |
| Protected-commerce browser | 34 passed |
| Firebase browser runtime | 9 passed |
| Functions syntax / patch integrity | passed / clean |
| Root production audit | 0 vulnerabilities |
| Functions production audit | 7 moderate transitive; 0 high/critical |
| Security checker | only classified synthetic fixtures/public Firebase configuration |

The accepted Functions audit and security-checker classifications are unchanged from round 1.

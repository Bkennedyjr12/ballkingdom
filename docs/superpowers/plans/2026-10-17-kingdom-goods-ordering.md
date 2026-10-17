# Kingdom Goods Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Prepare a separate physical apparel ordering boundary for supplier fulfillment and QuickBooks payment without selling unverified concept garments.

**Architecture:** Server-owned variant mappings and verified quotes precede invoices. Authoritative QuickBooks payment readback precedes one durable supplier dispatch. Missing supplier credentials, sample approval, tax, shipping, or merchant verification disables checkout.

**Tech Stack:** Node 22, Firebase Functions, Firestore, static HTML/CSS/JavaScript, existing QuickBooks adapter, Apliiq HMAC API.

**Spec:** User-approved apparel and supplier launch packet, outputs/kingdom-goods-launch-2026-10-17; public collection shop.html.

## Global Constraints
- Merchant requested: The Ballers Kingdom QuickBooks company.
- No paid supplier order, sample charge, or fabricated production SKU.
- Concept imagery does not establish manufacturer availability or artwork approval.
- No credentials, customer address, or payment data in public files or logs.
- Preserve existing digital-product payment and fulfillment behavior.
- Future shop operator: Building Kingdoms Collaborative, doing business as The Builders Kingdom; no implied tax exemption.

## Review Focus
- Repeated payment events cannot submit duplicate supplier orders.
- Unknown POST outcome remains held for reconciliation.
- Client prices and supplier identifiers cannot override server mappings.
- Missing sample, tax, shipping, or merchant verification blocks payment.
- Webhooks are authenticated hints and require provider order readback.

### Task 1: Validated physical catalog and quotes
Files: functions/src/apparel/catalog.js, order.js; functions/test/apparel*.test.*.
- [ ] Write rejecting tests for unverified configuration, forged prices, invalid address, stale quote, and integer overflow; run red.
- [ ] Implement catalog, selection/address validation, verified server quote and readiness assessment.
- [ ] Run focused tests green.

### Task 2: Supplier transport
Files: functions/src/apparel/apliiq.js, functions/test/apliiq.test.js.
- [ ] Test official signature format, tampered webhook, malformed response, 202 response and timeout without retry; run red.
- [ ] Implement injected HTTP adapter using exact-body HMAC and sanitized errors.
- [ ] Run focused tests green. No live order tests: supplier has no sandbox.

### Task 3: Physical order lifecycle and payment boundary
Files: functions/src/apparel/service.js, functions/test/apparel-service.test.*; index.js only for disabled/readiness runtime entrypoints until verified live dependencies exist.
- [ ] Test authoritative payment and exact totals, expiry, duplicate submission, unknown outcome hold, and missing dependency rejection; run red.
- [ ] Implement dependency-injected service with durable repository contracts. Keep customer invoice creation and supplier dispatch closed until activation evidence exists.
- [ ] Run focused and existing backend suites.

### Task 4: Storefront and operator runbook
Files: apparel-order.html, assets/js/apparel-order.js, assets/css/apparel-order.css, shop.html, scripts/build-site-preview.mjs, docs/operations/kingdom-goods-ordering.md.
- [ ] Add linked accessible selection preview with explicit launch status, no collected customer address before live quote service exists.
- [ ] Document exact account setup, secret names, variant proof, shipping/tax verification, sample and controlled pilot requirements.
- [ ] Verify mobile/desktop, source tests, public packaging and private file exclusion.

Execution: continue the previously approved ECOAI agent workflow. Backend slices delegated with exclusive ownership; parent integrates and verifies. Missing account access requested asynchronously. This plan does not authorize supplier charges.

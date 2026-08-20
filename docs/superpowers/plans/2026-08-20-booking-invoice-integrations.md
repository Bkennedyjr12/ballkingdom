# Booking and Invoice Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure Microsoft 365 appointment confirmations and manually approved QuickBooks invoice delivery for all three Ballers Kingdom services.

**Architecture:** Firebase Functions reacts to accepted Firestore appointments, schedules approval records twenty-four hours before service, and exposes an admin-only approval callable. Provider adapters use OAuth refresh tokens stored in Secret Manager; domain functions remain dependency-injected and independently testable.

**Tech Stack:** Node.js 22, Firebase Functions v2, Firestore, Cloud Scheduler, Secret Manager, Microsoft Graph, QuickBooks Online REST API, Node test runner.

**Spec:** `docs/specs/booking-invoice-integrations.md`

## Global Constraints

- Never expose OAuth credentials or tokens to browser code.
- Appointment confirmations send automatically only after a booking is accepted.
- QuickBooks invoice creation and invoice email delivery require an authenticated admin approval.
- Invoice approvals become due twenty-four hours before service.
- All provider writes use stable idempotency keys and persist receipts.

---

### Task 1: Domain workflow

**Files:**
- Create: `functions/src/domain/workflow.js`
- Test: `functions/test/workflow.test.js`

**Interfaces:**
- Produces: `validateAppointment(data)`, `isApprovalDue(data, now)`, and `buildInvoiceRequest(data)`.

- [ ] Write failing tests for service validation, the 24-hour boundary, catalog-priced training, and case-by-case inspection/consulting amounts.
- [ ] Run `npm --prefix functions test -- workflow.test.js` and verify failure.
- [ ] Implement the three pure functions with integer-cent validation and normalized email/service values.
- [ ] Run the focused test and verify it passes.

### Task 2: Provider adapters

**Files:**
- Create: `functions/src/providers/microsoft-graph.js`
- Create: `functions/src/providers/quickbooks.js`
- Test: `functions/test/providers.test.js`

**Interfaces:**
- Produces: `createGraphClient(config, fetchImpl)` with `sendConfirmation()` and `sendInvoice()`.
- Produces: `createQuickBooksClient(config, fetchImpl)` with `createInvoice()` and `getInvoicePdf()`.

- [ ] Write failing fetch-mock tests that assert token exchange, endpoints, message shape, invoice line mapping, and provider error redaction.
- [ ] Run the focused provider tests and verify failure.
- [ ] Implement minimal OAuth refresh and provider requests without logging tokens or customer content.
- [ ] Run the focused provider tests and verify they pass.

### Task 3: Firebase orchestration

**Files:**
- Create: `functions/src/index.js`
- Create: `functions/src/orchestration.js`
- Test: `functions/test/orchestration.test.js`

**Interfaces:**
- Consumes: domain and provider interfaces from Tasks 1–2.
- Produces: booking-created handler, hourly approval staging handler, and admin-only invoice approval callable.

- [ ] Write failing tests for automatic confirmation, duplicate suppression, due-record staging, admin rejection, and one-time invoice approval.
- [ ] Run the focused orchestration tests and verify failure.
- [ ] Implement Firestore transactions and stable receipt fields.
- [ ] Run the focused tests and verify they pass.

### Task 4: Firebase configuration and operator documentation

**Files:**
- Create: `functions/package.json`
- Create: `functions/.gitignore`
- Create: `functions/README.md`
- Modify: `firebase.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: deployable Functions source and explicit OAuth/deployment runbook.

- [ ] Configure Node 22, emulator commands, lint-safe tests, Secret Manager bindings, and the hourly schedule.
- [ ] Document exact Firestore schema, required secrets, OAuth redirect URIs, admin claim setup, and rollback.
- [ ] Run `npm --prefix functions test` and `npm --prefix functions run check`.

### Task 5: Verification

**Files:**
- Modify only when verification reveals a scoped defect.

- [ ] Run the full Functions test suite.
- [ ] Run dependency audit and distinguish inherited static-site findings from new backend findings.
- [ ] Run Firebase configuration validation without deploying.
- [ ] Confirm repository scans contain no credentials, refresh tokens, or client secrets.
- [ ] Review the diff and stop before OAuth grants or production deployment.

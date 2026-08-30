# QuickBooks Commerce Operator Runbook

## Scope and non-negotiable boundaries

This runbook covers the Ballers Kingdom invoice-first commerce pilot. QuickBooks Online Accounting is the authoritative source for invoices, payments, refunds, fees, deposits, and settlement. Firebase stores redacted workflow state only.

A refund review request is **not approval to execute a refund**. `requestRefundReview` creates an internal work item only. Neither it nor `reconcileOrder` nor `reconcileRefund` calls a provider refund operation. A separately approved operator action in QuickBooks is required for every refund. An action visible in QuickBooks Payments is not reconciled until current QuickBooks Accounting entities independently prove the exact realm, order, invoice, payment, currency, and amount.

Do not send an authentication email or QuickBooks invoice email, initiate a payment/refund, change a secret, deploy, or enable a rollout flag without Brian's separate approval for that exact action and recipient/amount where applicable. Approval for one action does not authorize another.

## Authoritative identities and targets

- Firebase account: `lilpelejr12@gmail.com`
- Firebase project: `the-ballers-kingdom`
- Functions codebase: `ballkingdom-integrations`
- Hosting target/site: `public` / `ballkingdom-com`
- Microsoft sender, only after exact-message approval: `info@ballkingdom.com`
- QuickBooks company: The Ballers Kingdom; verify the current realm with a read-only Accounting call at operation time. Do not copy the realm value into logs or this runbook.
- Administrator callables: Firebase Auth user with a current `admin:true` custom claim and valid App Check token.

Never rely on the ambient Firebase CLI project. Every Firebase command must include both `--project the-ballers-kingdom` and `--account lilpelejr12@gmail.com`.

## Configuration and secrets

Secret Manager names (values must never appear in source, screenshots, logs, command arguments, or evidence):

- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_REFRESH_TOKEN`
- `QBO_REALM_ID`
- `COMMERCE_PILOT_RECIPIENT_EMAIL`
- `QBO_WEBHOOK_VERIFIER_TOKEN` only if a separately reviewed webhook release is later approved
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REFRESH_TOKEN` for the separately gated authentication-email lane

Non-secret rollout state is committed in `functions/.env.the-ballers-kingdom`. Before any pilot deployment, read it back and require the reviewed digital/service Boolean values. No secret value belongs there.

## Local and sandbox verification

Use synthetic `.invalid` recipients only. Never deliver a production authentication or invoice email from a test.

```bash
npm ci
npm --prefix functions ci
npm --prefix functions test -- test/commerce/refunds.test.js
npm --prefix functions test
npm --prefix functions run check
```

For an authorized Intuit sandbox, use a sandbox-only company and clearly prefixed test customer, item, invoice, and payment records. Create/read only sandbox entities. Do not send an invoice to a real address and do not issue a live-company refund. Prove exact current Invoice and Payment evidence with read-back from Accounting, not from the local test fixture that wrote it.

The authoritative Firestore and Storage Rules sources, mappings, Java runtime, and emulator suite remain required release gates. A static deny fragment is not runtime authorization proof.

## Approved operator sequence

1. Verify the administrator identity, App Check, Git commit, Firebase project/account, rollout flags, and clean tests.
2. Read the order in the protected operator surface. Responses must contain only the order handle, state, amount/currency needed for the decision, and redacted disposition—never customer email, provider URLs, tokens, realm, invoice/payment identifiers, or secret material.
3. Run `reconcileOrder` to re-fetch the Invoice/Payment through the existing exact Accounting evidence verifier. A website state, webhook hint, email, invoice-send response, or invoice balance alone is insufficient.
4. If a customer requests review, record the bounded reason and amount through `requestRefundReview`. The amount must be integer cents and cannot exceed the atomically verified unrefunded amount, including other pending review work items.
5. Review the internal work item. This is still not authority to refund.
6. Obtain Brian's separate approval for the exact order, amount, and QuickBooks operator refund action.
7. In QuickBooks, confirm company, customer, original Invoice, original Payment, payment method, requested amount, and current unrefunded amount. Execute once through the documented QuickBooks operator UI. Do not use a website callable or an undocumented API.
8. Read back the current refund/reversal in QuickBooks Payments and current documented Accounting entities. Confirm the original payment method shows the expected refund lifecycle.
9. Run `reconcileRefund`. It may set `refunded` only when the current documented Accounting evidence exactly binds the same realm, order reference, Invoice, Payment, currency, and amount. Missing, partial, stale, ambiguous, wrong-realm, deleted, pending, or undocumented evidence preserves `paid`/`fulfilled` and records manual review.
10. Verify settlement/deposit separately. A refund acceptance is not settlement. Compare the merchant settlement/deposit view and original payment method; record only redacted timestamps and safe handles.

## Scoped Firebase commands

These are examples for an already approved release. Always run and review the exact dry run first; a dry-run approval does not authorize the deployment.

```bash
firebase deploy --only functions:ballkingdom-integrations:requestRefundReview,functions:ballkingdom-integrations:reconcileOrder,functions:ballkingdom-integrations:reconcileRefund --project the-ballers-kingdom --account lilpelejr12@gmail.com --dry-run
firebase deploy --only functions:ballkingdom-integrations:requestRefundReview,functions:ballkingdom-integrations:reconcileOrder,functions:ballkingdom-integrations:reconcileRefund --project the-ballers-kingdom --account lilpelejr12@gmail.com
```

Do not deploy Functions, Firestore Rules, Storage Rules, Hosting, or secrets as a broad target. Rules and Hosting require their own approvals and verification paths.

## Webhook-disabled reconciliation

If the owning Intuit Developer app is not visible or webhook ownership/signature configuration is not independently verified, keep the webhook disabled. Scheduled reconciliation remains the required recovery path. Webhook events, when later enabled, are hints only; every state transition still requires an authoritative Accounting re-fetch.

Use the administrator callable for a specific order or the reviewed scheduled reconciliation job. Never treat absence of a webhook as payment/refund failure, and never manufacture a provider-completed field.

## Monitoring and redacted queries

Use the Firebase/GCP console or scoped CLI with the exact project. Query only redacted event codes and safe order handles:

```bash
gcloud functions logs read requestRefundReview --gen2 --region us-west1 --project the-ballers-kingdom --limit 50
gcloud functions logs read reconcileOrder --gen2 --region us-west1 --project the-ballers-kingdom --limit 50
gcloud functions logs read reconcileRefund --gen2 --region us-west1 --project the-ballers-kingdom --limit 50
```

In protected Firestore operator tooling, filter `commerceAudit` for `refund_review_requested`, `refund_manual_review`, and `refund_reconciled`. Do not export raw documents. Alert on repeated evidence mismatch/unavailable codes, duplicate/excessive review attempts, provider outages, or any unexpected state transition. Logs and admin responses must not contain customer email, reason text, provider URL, realm/Invoice/Payment/refund IDs, access tokens, refresh tokens, or secret values.

## Ambiguity and manual review

- Invoice send accepted but outcome unknown: quarantine as `invoice_send_unknown`; do not resend automatically.
- Refund action visible only in the operator UI or Payments: keep `paid`/`fulfilled`; do not mark refunded.
- Accounting evidence unavailable or malformed: record `refund_evidence_unavailable` and retry only after the provider recovers.
- Evidence mismatches realm, order, invoice, payment, currency, or amount: record `refund_evidence_mismatch`; investigate in QuickBooks and do not coerce local state.
- Accounting does not document the processor refund in the exact supported shape: preserve the order and require manual accounting review.
- Duplicate request: return the same stable internal work item; never create a second provider action.

## Outage and rollback

During a QuickBooks, Firebase, Secret Manager, or App Check outage, fail closed: accept no provider mutation, send nothing, preserve `paid`/`fulfilled`, and record only a redacted retry/manual-review code. Do not rotate or inspect secret values as a troubleshooting shortcut.

Rollback disables both commerce flags in the reviewed `functions/.env.the-ballers-kingdom` commit and redeploys only the separately approved scoped Functions target. Rollback does not reverse an invoice, payment, email, or refund already accepted by an external system. Reconcile those independently after service recovery. If a refund may have been submitted but its outcome is ambiguous, do not retry; verify in QuickBooks Payments, Accounting, settlement/deposit, and the original payment method first.

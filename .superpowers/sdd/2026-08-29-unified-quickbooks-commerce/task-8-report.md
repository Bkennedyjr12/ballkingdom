# Task 8 implementation report

Implemented the independently gated service-invoice migration at the existing administrator `approveInvoice` boundary.

## Behavior

- Both commerce flags remain Boolean false by default and independent.
- With `COMMERCE_SERVICE_QBO_SEND_ENABLED=false`, accepted-booking confirmation and approved Graph/PDF invoice delivery retain the existing call order and create no commerce order.
- The digital pilot flag alone cannot select the service path.
- With only the service flag enabled, an accepted appointment creates/reuses one `pending_invoice_approval` service order and two durable Invoice effects. No Invoice is created or sent before administrator approval.
- Approval creates or authoritatively recovers one deterministic QuickBooks Invoice, crosses the send dispatch boundary once, suppresses the Graph invoice/PDF, and records only opaque identifiers plus the normalized send receipt.
- An ambiguous send enters `manual_review`; it is not resent.
- Exact QuickBooks Accounting Invoice/Payment evidence moves a service order from `invoiced` to `paid` without a digital fulfillment grant.

## Verification

- Focused Task 8 suite: 57 passed, 0 failed.
- Full Functions suite: 282 passed, 0 failed, 2 expected environment skips (Rules/Storage emulator prerequisites).
- Functions syntax check: passed.
- `git diff --check`: passed.
- Secure repository scan: completed; only pre-existing synthetic test-token patterns were reported, with no production credential added by Task 8.

## Boundaries and blockers

- No live provider, Graph, payment, invoice, email, deploy, secret, push, or Firebase operation was performed.
- Production commerce activation remains blocked by the previously recorded authoritative Firestore/Storage Rules and emulator gaps.
- The existing legacy training case with no explicit amount remains unsuitable for the service-commerce path until a server-owned service catalog price is defined; the migration fails closed rather than inventing a price.

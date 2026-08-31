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
- Catalog-priced training appointments with no explicit server amount remain entirely on the unchanged legacy Graph/PDF path even when the service flag is enabled; no partial commerce order is created and no browser amount is trusted.
- Appointment approval now has a unique five-minute claim lease, exact-claim completion/failure, and expiry reclaim. A crash after QuickBooks completion can safely reclaim the administrator gate and reuse the completed Invoice effects; ambiguous sends quarantine both the commerce order and appointment approval for manual review.
- The production appointment-approval repository is exported and exercised against serialized transactional state: parallel one-winner claims, the exact five-minute boundary, unique reclaim IDs, stale-claim rejection for every terminal operation, and successful current-claim completion/failure/quarantine.
- Create-timeout coverage now models a provider-side committed deterministic Invoice followed by client timeout, lease expiry/recovery, a second idempotent create attempt resolving to the same single provider Invoice ID, and exactly one send.

## Verification

- Focused Task 8 suite: 61 passed, 0 failed.
- Full Functions suite: 291 passed, 0 failed, 2 expected environment skips (Rules/Storage emulator prerequisites).
- Functions syntax check: passed.
- `git diff --check`: passed.
- Secure repository scan: completed; only pre-existing synthetic test-token patterns were reported, with no production credential added by Task 8.

## Boundaries and blockers

- No live provider, Graph, payment, invoice, email, deploy, secret, push, or Firebase operation was performed.
- Production commerce activation remains blocked by the previously recorded authoritative Firestore/Storage Rules and emulator gaps.
- The existing legacy training case with no explicit amount remains unsuitable for the service-commerce path until a server-owned service catalog price is defined; the migration fails closed rather than inventing a price.

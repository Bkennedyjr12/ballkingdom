# Booking, QuickBooks, and Microsoft 365 Integration Specification

## Approved workflow

- Services: soccer training, consulting, and home inspections.
- An accepted booking sends an appointment confirmation automatically from `info@ballkingdom.com`.
- Twenty-four hours before the scheduled start, the system stages an invoice approval request.
- No QuickBooks invoice or invoice email is created before Brian approves the request.
- Approval creates the QuickBooks invoice, obtains its PDF, and sends the invoice email from `info@ballkingdom.com`.
- Training uses the matching QuickBooks catalog item and catalog price.
- Consulting and home-inspection amounts are entered case by case.
- Provider calls are idempotent and every state transition has an audit receipt.

## Security boundaries

- Browser code never receives QuickBooks or Microsoft credentials.
- OAuth refresh tokens are stored as Secret Manager versions, not source code or public Firebase configuration.
- Approval requires Firebase Authentication and the custom claim `admin: true`.
- OAuth state is single-use, expires after ten minutes, and is checked server-side.
- Provider authorization and deployment are separate, explicitly confirmed operations.

## Appointment record

Firestore collection `appointments/{appointmentId}`:

```json
{
  "serviceType": "training | consulting | inspection",
  "serviceName": "60 Minute Training Session",
  "customerName": "Customer Name",
  "customerEmail": "customer@example.com",
  "startsAt": "Firestore Timestamp",
  "amountCents": 6000,
  "currency": "USD",
  "status": "accepted",
  "confirmation": { "status": "pending" },
  "invoiceApproval": { "status": "not_due" }
}
```

For training, `amountCents` may be omitted and QuickBooks supplies the catalog price. Consulting and inspection require a positive `amountCents` before approval.


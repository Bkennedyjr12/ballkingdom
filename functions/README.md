# Ballers Kingdom integrations

This Firebase Functions package implements the approved workflow for training, consulting, and home inspections.

## Behavior

1. Creating an accepted `appointments/{id}` document sends one Microsoft 365 confirmation from `info@ballkingdom.com`.
2. The hourly scheduler stages `invoiceApproval.status = "pending"` at 24 hours before the appointment.
3. Only a Firebase user with custom claim `admin: true` can call `approveInvoice`.
4. Approval creates the QuickBooks invoice, downloads its PDF, emails it from Microsoft 365, and records an audit receipt.

The functions never expose credentials to the static website. Do not deploy or authorize providers until the owner explicitly approves those actions.

## Required provider applications

### Intuit Developer

- Create one QuickBooks Online production app.
- Scope: `com.intuit.quickbooks.accounting`.
- Redirect URI: `https://us-west1-the-ballers-kingdom.cloudfunctions.net/quickBooksOAuthCallback`.
- Store its client ID and client secret using Firebase Secret Manager.

### Microsoft Entra ID

- Create one single-tenant web app in The Ballers Kingdom Microsoft tenant.
- Delegated permissions: `Mail.Send`, `openid`, `profile`, `email`, and `offline_access`.
- Redirect URI: `https://us-west1-the-ballers-kingdom.cloudfunctions.net/microsoftOAuthCallback`.
- The authorization screen must be completed while signed in as `info@ballkingdom.com`; the callback rejects every other mailbox.

## Secrets

Create each secret before deployment. Use a temporary `pending` value for refresh-token and realm secrets; the OAuth callbacks add the real version.

```bash
firebase functions:secrets:set QBO_CLIENT_ID --project the-ballers-kingdom
firebase functions:secrets:set QBO_CLIENT_SECRET --project the-ballers-kingdom
firebase functions:secrets:set QBO_REFRESH_TOKEN --project the-ballers-kingdom
firebase functions:secrets:set QBO_REALM_ID --project the-ballers-kingdom
firebase functions:secrets:set MS_TENANT_ID --project the-ballers-kingdom
firebase functions:secrets:set MS_CLIENT_ID --project the-ballers-kingdom
firebase functions:secrets:set MS_CLIENT_SECRET --project the-ballers-kingdom
firebase functions:secrets:set MS_REFRESH_TOKEN --project the-ballers-kingdom
```

Grant only the deployed Functions runtime service account `roles/secretmanager.secretVersionAdder` on `QBO_REFRESH_TOKEN` and `MS_REFRESH_TOKEN`. It needs this narrow permission because both providers rotate refresh tokens. Do not grant project-wide Secret Manager administration.

## QuickBooks service catalog

The existing company already contains:

- `60 Minute Training Session`
- `12 Session Package (60 Minute Training Session)`

Before live approval, add two service items with no fixed sales price:

- `Business Consulting`
- `Home Inspection`

Appointments must use these names exactly. Training appointments may omit `amountCents`; the QuickBooks catalog price is then used. Consulting and inspection appointments require a positive integer `amountCents`.

## QuickBooks commerce invoices and payment evidence

Commerce invoices stay entirely on the QuickBooks Online Accounting API and use only the `com.intuit.quickbooks.accounting` scope. The adapter uses the documented Invoice create/read/send operations, Payment read operation, and Invoice/Payment change-data-capture query. It does not call an Intuit Payments API host and does not construct a customer payment URL.

Each commerce Invoice stores `bk-order-${orderId}` in `PrivateNote`. Invoice creation uses a deterministic `requestid`; long order references are shortened only for that provider idempotency parameter, while the complete order reference remains on the Invoice. Before returning an Invoice ID, the adapter reads the Invoice back and requires exact customer, order reference, total, full unpaid balance, currency, item, quantity, unit-price, and line-amount agreement. `documentNumber` is a string or `null`, as Intuit documents when the `CustomTxnNumber` preference is enabled and no number is supplied.

The send method accepts only the documented result for the requested Invoice and recipient: `EmailStatus:'EmailSent'`, matching `BillEmail.Address`, and populated email `DeliveryInfo`. It still returns only `{invoiceId,sendAccepted:true}`. That result means the provider recorded its send operation; it is not proof of inbox delivery or payment.

Payment completion requires a fresh exact Invoice read and its linked Payment read. Provider amounts are converted to integer cents inside the new commerce evidence methods, and their raw QuickBooks payloads do not leave the adapter. The legacy appointment `createInvoice()` return remains unchanged for compatibility and still includes its existing `raw` member. Verification accepts only one present Invoice with the expected realm, order reference, currency, `TotalAmt`, and zero `Balance`, plus exactly one present Payment with the exact `TotalAmt`, zero `UnappliedAmt`, and one full application to that Invoice. Deleted, voided, partial, reversed, split, overpaid, underpaid, unapplied, missing, contradictory, or unknown evidence fails closed. `completed` is an internal conclusion made only after those checks; it is not an Intuit status field.

Change data capture is a polling aid only. Its normalized Invoice/Payment IDs must be refetched through the exact read methods before verification. No webhook is assumed or configured by this package.

## Appointment example

```js
await addDoc(collection(db, 'appointments'), {
  serviceType: 'inspection',
  serviceName: 'Home Inspection',
  customerName: 'Customer Name',
  customerEmail: 'customer@example.com',
  startsAt: Timestamp.fromDate(new Date('2026-08-22T18:00:00Z')),
  amountCents: 45000,
  currency: 'USD',
  status: 'accepted',
  confirmation: {status: 'pending'},
  invoiceApproval: {status: 'not_due'},
});
```

## Local verification

```bash
npm install
npm test
npm run check
firebase emulators:exec --only firestore,functions "npm test"
```

## Deployment and rollback

Deploy only these functions after provider setup and explicit production approval:

```bash
firebase deploy --only functions:ballkingdom-integrations --project the-ballers-kingdom
```

Rollback by disabling `confirmAcceptedBooking` and `stageInvoiceApprovals` in the Firebase console or deploying the previous commit. Existing invoices and sent mail are external records and are not deleted by rollback.

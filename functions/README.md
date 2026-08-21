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

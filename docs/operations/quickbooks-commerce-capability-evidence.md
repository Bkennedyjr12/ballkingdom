# QuickBooks Commerce Capability Evidence

**Recorded:** 2026-08-29

## Decision

Digital checkout is **Blocked**. Repository evidence confirms an Accounting-only
QuickBooks OAuth integration; it does not confirm a QuickBooks Payments merchant
approval or an Intuit production Payments-app capability. No payment endpoint,
credential, merchant setting, account, or live transaction was accessed or changed
to create this record.

Service invoicing is independently supported by the existing Accounting integration.
It may continue through the approved invoice workflow; it is not evidence that an
immediate website payment can be created and independently verified.

## Merchant and app evidence

| Evidence item | Status | Recorded value / boundary | Source |
| --- | --- | --- | --- |
| QuickBooks company name | Blocked by sign-in | Not accessed. | QuickBooks company settings (signed-in administrative view required) |
| QuickBooks realm suffix | Blocked by sign-in | Not accessed. | QuickBooks company settings (signed-in administrative view required) |
| QuickBooks Payments approval state | Blocked by sign-in | Not accessed; do not infer approval from Accounting OAuth. | [QuickBooks Payments fees and approval guidance](https://quickbooks.intuit.com/learn-support/en-us/help-article/process-credit-card-payments/credit-card-processing-quickbooks-online/L1n92y40h_US_en_US) |
| Enabled customer payment methods | Blocked by sign-in | Not accessed. This includes PayPal availability. | QuickBooks Payments settings (signed-in administrative view required) |
| Deposit account last four digits | Blocked by sign-in | Not accessed; no bank-account details are retained here. | QuickBooks Payments deposit settings (signed-in administrative view required) |
| Intuit production app Payments capability | Blocked by sign-in | Not accessed; repository configuration establishes no Payments app entitlement. | [Intuit Payments developer documentation](https://developer.intuit.com/app/developer/qbpayments/docs/develop) |
| Applicable merchant transaction-rate screen date | Blocked by sign-in | Not accessed. Public pricing is not merchant-specific rate evidence. | [QuickBooks public payment-rates page](https://quickbooks.intuit.com/payments/payment-rates/) |
| Accounting OAuth scope | Confirmed | `com.intuit.quickbooks.accounting` is the only configured QuickBooks scope. This is Accounting OAuth evidence only. | [`functions/src/providers/oauth.js`](../../functions/src/providers/oauth.js), [`functions/README.md`](../../functions/README.md) |

## Capability contract

`functions/src/providers/quickbooks-payments-capability.js` provides the local,
fail-closed `assertPaymentsCapability(config)` boundary. It rejects a configuration
unless both `accounting` and `payments` are verified and all documented capability
fields are present. A passing test fixture is a contract test only; it is not proof
that this merchant supports immediate payment, PayPal, or webhooks.

Before any digital checkout work can proceed, an authorized administrator must make
the following read-only confirmation from the relevant signed-in Intuit/QuickBooks
views and record only non-secret results here:

1. QuickBooks Payments merchant approval and the connected company/realm identifier.
2. Production Payments app capability appropriate to the documented integration.
3. Enabled customer payment methods, including whether PayPal is available.
4. The destination deposit account's last four digits and current merchant-rate screen date.
5. An approved, documented method to create and independently verify an immediate
   website payment, including the required webhook/callback capability.

Until all five are confirmed, `supportsImmediatePayment`, `supportsPayPal`, and
`supportsWebhooks` have no live verified values. Do not create a payment request,
select an API endpoint, enable a method, or change account settings while this gate
is blocked.

## Official documentation consulted

- [Intuit Payments developer documentation](https://developer.intuit.com/app/developer/qbpayments/docs/develop)
- [Intuit QuickBooks Online OAuth 2.0 documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth2.0)
- [Intuit QuickBooks Online webhooks documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks)
- [QuickBooks Payments fees and approval guidance](https://quickbooks.intuit.com/learn-support/en-us/help-article/process-credit-card-payments/credit-card-processing-quickbooks-online/L1n92y40h_US_en_US)
- [QuickBooks public payment rates](https://quickbooks.intuit.com/payments/payment-rates/)

These public sources explain available Intuit/QuickBooks capabilities and pricing.
They do not verify this merchant's approval, its production application access, or
its enabled payment methods.

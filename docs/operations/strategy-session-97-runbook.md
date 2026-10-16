# $97 Strategy Session (30 min) — inactive release runbook

Status: **code only, fail-closed. Nothing deployed, no QBO write, no customer/invoice/payment/email.**

## Mechanism
QuickBooks Online Accounting API invoice (existing commerce flow) -> buyer pays via the QBO-hosted
invoice (QuickBooks Payments: card / Apple Pay / PayPal / Venmo, verified enabled 2026-09-01) ->
`verifyOrderPayment` / reconciler confirms exact Invoice+Payment evidence -> order status exposes the
allowlisted Calendly URL (`getPostPaymentBookingUrl`). The adapter never constructs a QBO payment URL;
the Accounting API offers no standalone hosted "payment link" product, and the Intuit Payments API
would need a separate scope and card handling on our side.

## Gates (all must be true to sell)
1. QBO item created + read back: deploy `ensureStrategySessionItem`, call it as admin, record `itemId`
   in `service-offers.js`, set `quickBooks.itemVerified=true`.
2. Accountant confirms service is non-taxable (`tax.accountantVerified=true`).
3. Wire `strategy-session-30` into `createDigitalOrder`-equivalent service order path + order status
   response (follow-up PR) and the page CTA.
4. `active=true`, `release.deployApproved=true`, public checkout flags
   `COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=true`, `COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=true`
   in `functions/.env.the-ballers-kingdom` (controlled owner pilot first).
5. Scoped deploy (Functions + hosting:public) per `public-quickbooks-checkout-release.md`.

## Risk
The Calendly URL `/ballerskingdom/30min` is also linked publicly as a *free* consult on
contact.html, so payment does not gate booking. Use a separate (paid / secret) Calendly event type,
or retire the free link, before activation.

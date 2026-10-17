# Kingdom Goods physical ordering

Status: preparation only. No customer payment, supplier order, or shipment has been activated.

## Merchant and operator
Brian requested The Ballers Kingdom QuickBooks company. Future shop operator copy names Building Kingdoms Collaborative, doing business as The Builders Kingdom. Before sales, confirm the actual contracting seller, receiving bank account, invoice identity, return address, and charitable contribution disclosures. Do not infer a tax exemption from nonprofit status.

## Supplier connection
1. Sign in to Apliiq and establish a custom store. Account terms, password creation, billing information and production charges require Brian's participation.
2. Obtain the custom store API key and shared secret. Provision them server-side as APLIIQ_API_KEY and APLIIQ_SHARED_SECRET; never place them in source, the browser, logs or chat. Do not print their values during setup.
3. Confirm the white-label packing slip, return address and eligible private-label neck treatment. Existing Nike branding requires genuine Nike garments. Do not apply a swoosh to an unrelated blank.
4. Create each approved design/variant in Apliiq and capture its actual APQ SKU. The concept names and images in this repo are not supplier SKUs.
5. Approve digitized embroidery placement, stitch readability, thread colors and a physical sample. Fixed initial editions require their own mapped production variants. Confirm smart trouser garment and discreet rear-pocket placement separately.

## Price and delivery gate
The launch workbook is an estimate, not the live price list. Capture supplier cost, each embroidery placement, digitization, eligible label, handling, shipping, tax, and size/color surcharges. Approve retail price and margin. Shipping must be verified for the destination and selected service; no guessed $7.50 quote or free-shipping promise. Resolve sales tax treatment for merchandise and shipping with the merchant's configured tax system.

## Code boundaries
- `functions/src/apparel/catalog.js`: concept catalog and explicit readiness failures.
- `functions/src/apparel/order.js`: strict selection/address validation and verified quote snapshot.
- `functions/src/apparel/apliiq.js`: exact-body HMAC transport; injected HTTP tests only.
- `functions/src/apparel/service.js`: independent fulfillment lifecycle contract; durable storage and authoritative payment adapter required before runtime exposure.
- `apparel-order.html`: public kit preview; checkout intentionally disabled.

The existing digital QuickBooks adapter is NOT a physical invoice adapter: its one-line quantity-one verifier cannot reconcile merchandise plus shipping and tax. Do not route apparel into digital fulfillment.

## Runtime activation still required
Implement and verify a dedicated physical invoice adapter with exact item references, quantity, unit price, shipping line, ShipAddr and provider-calculated tax readback. Reuse the persisted QuickBooks credential coordinator, not a manual refresh token. Verify the fresh CompanyInfo identity equals The Ballers Kingdom. Persist immutable quote, invoice binding and private address in a server-only namespace. Expose only authenticated/AppCheck-protected customer operations with ownership and rate limits.

The current address normalizer is an internal quote format; collect separate recipient first/last names and explicitly map country/state names and codes for Apliiq rather than guessing a name split. Retain shipping and tax evidence bound to the exact variant, quantity, address and quote expiry.

Use a Firestore transaction to reserve the supplier dispatch before POST. A timeout, 202 or malformed provider result must remain held for reconciliation; never retry automatically. Reconcile using the stable store system order ID and saved supplier ID. Payment must be verified from current QuickBooks invoice and linked payment records, including exact merchant/realm, invoice/order/customer references, USD, total and no reversal/cancellation. A browser success or webhook cannot prove payment.

Authenticate Apliiq webhook against exact raw bytes, then read the supplier order back. Shipment and delivery are later states than acceptance. Capture partial shipments, cancellation and refund review without redispatching. Keep address and tracking data private. Authenticate and rate-limit status lookup.

## Controlled pilot
Apliiq has no sandbox: even an API test can create a real charge. Obtain approval for the exact garment, embroidery, destination and maximum spend before one sample/pilot. Verify invoice, payment, single supplier order, full shipping cost, tracking and actual embroidered delivery. Only then enable the mapped variants individually. Do not enable all concepts with a global switch.

## Sources
- https://help.apliiq.com/portal/en/kb/articles/create-order
- https://help.apliiq.com/portal/en/kb/articles/get-order
- https://help.apliiq.com/portal/en/kb/articles/fulfillment-url
- https://help.apliiq.com/portal/en/kb/articles/how-to-setup-a-custom-store
- https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice

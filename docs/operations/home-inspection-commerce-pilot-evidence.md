# Home Inspection Study Guide commerce pilot evidence

Status: **production dependencies verified; product remains inactive and fail-closed**

Reviewed: 2026-08-31

## 2026-08-31 production dependency verification

- QuickBooks company readback: `The Ballers Kingdom`.
- QuickBooks item ID: `8`.
- QuickBooks item readback: `Home Inspection Study Guide`, active, `NonInventory`,
  USD $49.00, non-taxable, income account `Services` (ID `26`).
- Private bucket: `the-ballers-kingdom.firebasestorage.app`.
- Immutable object generation: `1788191152627469`.
- Provider metadata readback matched the exact key, 71,250,419 bytes,
  `application/pdf`, and MD5 `XXzfi6ddgB6rru9fLIrv7Q==`.
- The source file still independently matches the recorded SHA-256 and MD5.
- No customer, invoice, payment, refund, authentication email, or invoice email was created
  or sent by these dependency-verification actions.

The catalog records these verified production identifiers, but remains `active: false`.
The professional tax-verification gate and protected-download runtime wiring remain false,
so no buyer can create an order.

## Approved pilot mapping

- SKU: `home-inspection-study-guide`
- Public founding price: USD $49.00 (4,900 cents)
- QuickBooks item name: `Home Inspection Study Guide`
- Delivery: electronic download only; no printed copy or physical storage media
- Private object destination: `private-commerce/home-inspection-study-guide/guide-v1.pdf`
- Content type: `application/pdf`
- Exact bytes: 71,250,419
- SHA-256: `2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d`
- Source/provider MD5 (base64): `XXzfi6ddgB6rru9fLIrv7Q==`
- Immutable Cloud Storage generation: `1788191152627469`

The size and digest above were independently computed from the reviewed source artifact and
matched against the private provider object metadata on 2026-08-31.

## Proposed California tax mapping

The proposed mapping is non-taxable for this exact electronic-only delivery model. The
California Department of Tax and Fee Administration states that electronically transmitted
data products, including digital books, are generally not taxable when delivered over the
Internet; providing a printed copy or physical backup medium can make the sale taxable.

Authoritative source: [CDTFA Publication 109 — Nontaxable Sales](https://cdtfa.ca.gov/formspubs/pub109/nontaxable-sales.htm), accessed 2026-08-30 (page revision shown as July 2026).

This is an implementation proposal, not tax advice or a final tax determination. Before the
product can be activated, an accountant must confirm the treatment and the matching
QuickBooks tax code. Re-review is required if delivery includes any tangible copy or media,
or if buyers or operations extend beyond the exact California-only assumption documented
here.

## Fail-closed activation gates

The server catalog remains `active: false` even though it now contains the approved price.
Purchasability also requires all of the following server-side gates:

1. The exact QuickBooks item exists and its immutable ID/name/active readback is verified.
2. The tax classification and QuickBooks tax code are accountant-verified.
3. The private artifact is uploaded and its exact generation, byte size, MIME type, and
   provider MD5 metadata are read back and verified against the source SHA-256 evidence.
4. The protected-fulfillment runtime is verified ready.
5. A separate production deployment is approved.

Browser input cannot set the amount, replace these mappings, or bypass any gate. The approved
production preparation created only the exact QuickBooks item and private artifact described
above. It did not activate checkout, create an order, or send a message.

When those gates are eventually satisfied, the normalized order will carry a server-created
QuickBooks item ID/name/tax-code snapshot with a SHA-256 fingerprint. The Accounting adapter
must read that item by ID (never by an ambiguous name query), require it to remain active with
the approved name, write the approved `TaxCodeRef`, and verify the Invoice line item and tax
references on authoritative readback. None of these server-only fields are returned by the
buyer capability or order-status APIs.

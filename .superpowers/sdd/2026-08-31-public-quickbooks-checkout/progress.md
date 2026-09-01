# SDD ledger — plan: docs/superpowers/plans/2026-08-31-public-quickbooks-checkout.md

## Preflight scan

| Tasks | Shared file/interface | Finding |
|---|---|---|
| 1 → 2 | `readCommerceFeatureFlags().publicDigitalCheckoutEnabled` | Clean: Task 1 defines the default-off flag Task 2 consumes. |
| 1 → 3 | catalog tax/release metadata and purchasable predicate | Clean: Task 1 records verified metadata while leaving activation false; Task 3 consumes only the server predicate. |
| 1 ↔ 6 | tax/accountant/owner evidence | Clean: Task 1 records source decisions; Task 6 independently packages current evidence. |
| 1 ↔ 7 | `functions/.env.the-ballers-kingdom`, catalog activation gates | Clean: Task 1 keeps false; Task 7 changes only after owner transaction and deploy approval. |
| 2 → 3 | authoritative public email identity and rate-limited sign-in | Clean: Task 2 produces verified public Auth precondition; Task 3 never trusts browser email. |
| 2 ↔ 3 | `commerce-service.js`, `order-repository.js` | Clean: Task 2 owns auth effects/limits; Task 3 owns order uniqueness/invoicing. Review must reject cross-purpose refactors. |
| 2 → 4 | compatibility callable `requestPilotSignInLink` exposed as browser boundary `requestPublicSignInLink` | Clean: no destructive Function rename; browser terminology may change independently. |
| 2 ↔ 7 | authorized automatic Graph sign-in delivery | Clean: Task 2 implements; Task 7 alone authorizes live controlled send and public activation. |
| 3 → 4 | public capability/order contracts | Clean: Task 3 produces strict server responses; Task 4 consumes and validates them. |
| 3 → 5 | deterministic public order ownership and exact QBO evidence | Clean: Task 5 exercises the Task 3 boundary without redesigning it. |
| 3 ↔ 6 | Apple Pay/card/PayPal capability evidence | Clean: Task 3 encodes required fields; Task 6 must read them from the signed-in company without mutation. |
| 4 ↔ 5 | protected grant/redeem browser and server contracts | Clean: Task 4 preserves the browser path; Task 5 proves cross-customer and payment gates. |
| 4 ↔ 6 | `tests/storefront-html.test.mjs` | Clean: Task 4 covers UI content; Task 6 adds packaging/export assertions only. |
| 5 ↔ 6 | Rules, security tests, Hosting exclusions | Clean: Task 5 validates Rules; Task 6 verifies the deployment package and may change `firebase.json` only on a failing test. |
| 6 → 7 | release manifest, rollback, capability evidence | Clean: Task 7 consumes the reviewed exact manifest and stops on mismatched production state. |
| 1 | tests vs implementation | Clean: tests require reviewed metadata but explicitly keep activation false. |
| 2 | tests vs implementation | Clean: generic responses, no provider calls on rejection, multi-dimensional limits, and effect state are testable with injected dependencies. |
| 3 | tests vs implementation | Clean: capability shape and reservation semantics are explicit; browser never controls invoice fields. |
| 4 | tests vs implementation | Clean: Playwright covers public and returning flows; existing protected suite remains a regression boundary. |
| 5 | tests vs implementation | Clean: emulator and service tests cover exact payment and private delivery without live provider mutation. |
| 6 | evidence vs side effects | Clean: all provider checks are read-only; any setting change stops for approval. |
| 7 | production actions vs global constraints | Clean: code deploys inactive; exact controlled transaction and later activation each stop for action-time approval. |

Preflight result: no contradictions or rulings required.

Task 1: dispatched from base e7e0ab5 to `/root/public_checkout_task1`.

Task 1: Ruling: `functions/test/commerce/catalog-artifact-evidence.test.js` is Task 1 scope despite not being listed in the plan because it directly asserts the tax-verification state Task 1 intentionally changes — leaving the full suite red would make the new evidence internally contradictory — cost if wrong: Task 1 expands by one evidence-test file.

Task 1: review found 1 Important issue (public dotenv flag was not regression-locked to false).

Task 1: fix round 1/5 (1 addressed, 0 open — exact public false flag assertion; commits 2b9245d..a9caa1c).

Task 1: complete (commits e7e0ab5..a9caa1c, review clean).

Task 2: dispatched from base a9caa1c to `/root/public_checkout_task2`.

Task 2: review found 4 Important issues (spoofable proxy-derived IP; App Check transport rejection differs from generic body; unbounded rate/effect/audit retention; incomplete opaque recovery/orphan cleanup) and 2 Minor issues (timing-generic residual; missing boundary/recovery/retention coverage).

Task 2: Ruling: keep Firebase `enforceAppCheck:true`; missing/invalid App Check is intentionally rejected by Firebase with transport-level `UNAUTHENTICATED` before the generic business response — disabling or manually emulating App Check would weaken the spec's binding enforcement requirement — cost if wrong: callers can distinguish missing/invalid App Check from syntactically valid App Check requests.

Task 2: minor (deferred): valid-App-Check accepted requests take longer than rejected/limited requests; high-entropy order handles, generic bodies, multi-dimensional limits, and App Check reduce exploitability, but final review must reassess the timing oracle.

Task 2: Ruling: Microsoft Graph Sent Items retention is provider-required transactional-mail evidence, not prohibited application/Firestore action-link persistence — the approved design authorizes Graph delivery and does not require disabling mailbox audit history — cost if wrong: one-time Firebase links remain visible to authorized mailbox users until provider retention removes them.

Task 2: fix round 1/5 (2 addressed, 2 open — App Check transport contract and opaque recovery addressed; GCP XFF/socket assumption rejects valid traffic; cleanup quota accounting is faulty and unresolved manual-review evidence is deleted; commits f026fc0..0e561a1).

Task 2: fix round 2/5 (2 addressed, 3 open — XFF final suffix supports IPv4/IPv6 but incorrectly validates attacker prefix; retained manual-review pages starve later cleanup; production cleanup composite indexes absent; independent budgets/safe-state retention/throughput addressed; commits 0e561a1..5c8ce2c).

Task 2: fix round 3/5 (3 addressed, 0 open — final-two XFF parsing, eligible-before-pagination cleanup, exact Firestore index manifest; commits 5c8ce2c..8231adb).

Task 2: complete (commits a9caa1c..8231adb, review clean; deferred timing Minor remains for final review).

Task 3: dispatched from base 8231adb to `/root/public_checkout_task3`.

Task 3: review found 4 Important issues (PayPal/ACH/webhooks booleans not required true; invoice online-payment flags neither set nor read back; ambiguous duplicate-email QuickBooks customers chosen arbitrarily; historical reservation namespace compatibility not actually tested) and 1 Minor issue (fulfilled reuse response always reports payment pending).

Task 3: fix round 1/5 (4 addressed, 1 open — strict isolated capability predicate exists but production order creation never invokes it; invoice flags/readback, QBO customer ambiguity, migration test, and stored status addressed; commits db92c72..59d3b96).

Task 3: fix round 2/5 (1 addressed, 0 open — server-owned default-false capability now gates catalog/order runtime; concurrent resolved ambiguity maps to manual review; commits 59d3b96..cd9ba94).

Task 3: minor (deferred): a concurrent waiter may return processing-pending after the bounded 500 ms poll if a real QBO ambiguity resolves later; effect ownership still prevents duplicate provider mutation.

Task 3: complete (commits 8231adb..cd9ba94, review clean; deferred bounded-waiter Minor remains for final review).

Task 4: Ruling: `tests/storefront-browser.spec.mjs` may abort external Google Fonts during local browser verification because the checkout behavior does not depend on third-party font availability and the external request made the suite nondeterministic — cost if wrong: this suite will not detect a production Google Fonts loading failure.

Task 4: Ruling: migrate the reviewed implementation snapshot into the standalone clone `/private/tmp/ballkingdom-public-commerce-isolated` after the original linked worktree's shared Git object store repeatedly stalled. Tasks 1–3 reviews remain authoritative and their exact content was migrated in aggregate commit `d93e2ed`; Task 4 is isolated in `9e4527b` — cost if wrong: the independent branch preserves verified content and task separation but not the original granular commit ancestry.

Task 4: implementation verified in the standalone clone (31 commerce browser tests, 22 storefront unit/content tests, 4 storefront browser tests, 457 Functions tests passed with 2 intentional emulator skips; commit d93e2ed..9e4527b). Independent review in progress.

Task 4: review found 2 Important issues (paid/fulfilled deterministic reuse responses were rejected; linked terms lacked a substantive refund policy) and 1 Minor issue (pre-purchase display values were hardcoded rather than server-authoritative).

Task 4: fix round 1/5 (all findings addressed — authenticated status readback for paid/fulfilled reuse, substantive digital-product terms, strict frozen buyer-safe display schema; commit 9e4527b..b085651).

Task 4: complete (commits d93e2ed..b085651, independent re-review clean; 34 commerce browser tests, 25 runtime/content tests, 23 storefront unit tests, 4 storefront browser tests, and 457 Functions tests passed with 2 intentional emulator skips).

Task 5: Ruling: expand the listed test/rules scope narrowly to `functions/src/providers/quickbooks.js`, `functions/src/commerce/quickbooks-payment-verifier.js`, `functions/src/commerce/commerce-service.js`, and their direct tests because the existing Accounting evidence omitted customer, item, tax, quantity, and line-price identity and could not satisfy the plan's wrong-customer/item boundary — cost if wrong: Task 5 includes a small production verifier-contract change rather than remaining tests/rules-only.

Task 5: implementation complete at `5401a94` (247 focused security tests; 483 Functions pass with 2 intentional emulator skips outside emulators; full Firestore+Storage emulator run 485/485 with 0 skips; syntax and diff checks clean). Independent review in progress.

Task 5: review found 1 Important backward-compatibility issue (strict digital-only unpaid evidence fields were applied to service invoices, forcing valid unpaid service orders into manual review).

Task 5: fix round 1/5 (resolved — common unpaid predicate preserved for service, strict line/customer evidence remains exclusive to digital products, unknown types fail closed; commit 5401a94..bab9a06).

Task 5: complete (commits b085651..bab9a06, independent re-review clean; 260 focused tests, 484 Functions pass with 2 intentional emulator skips, full Firestore+Storage emulator run 486/486 with 0 skips, syntax and diff checks clean).

Task 6: Ruling: use signed-in QuickBooks UI evidence for the exact company, merchant/payment settings, item 8, online delivery, and representative no-surcharge path; map UI `Nontaxable` to the reviewed API `NON` invoice construction; treat Apple Pay as conditional official Intuit behavior and require visibility on the controlled owner invoice — cost if wrong: the read-only review does not prove Apple Pay on every customer device or an account-global surcharge state.

Task 6: review/fix rounds expanded the plan to add a separate default-off public auth/resume flag and an admin/App-Check-protected redacted QuickBooks health callable because a single order flag could strand paid customers during rollback and no executable production OAuth/company health gate existed — cost if wrong: the release adds one feature flag and one reviewed read-only Function beyond the original inventory.

Task 6: review required four fix rounds: stale pilot evidence/unsafe rollback; non-executable health gate; service-preserving auth/order separation; truthful unchanged-token continuity vs rotated-token persistence; Hosting root Markdown exclusion; exact-bound Secret Manager wording. All Critical/Important/Minor findings resolved.

Task 6: complete at `bb66692` (final independent review clean; exact 22 exports/21-function allowlist excluding `confirmAcceptedBooking`; 34 storefront unit tests, 4 storefront browser flows, 34 protected-commerce browser flows, 498 Functions tests with 496 pass/2 emulator-only skips, full emulator 498/498; branch clean and inactive).

Whole-branch review round 1: review found 6 Important issues (Firestore index sequencing/cleanup coupling; unredacted QuickBooks abort semantics and post-mutation ambiguity; no independently gated owner-only inactive pilot; incomplete exact public-activation tuple; App Check `appId` mislabeled as a device dimension with a non-independent global breaker; auth ambiguity quarantine scoped to an issuance bucket).

Whole-branch review round 1: Ruling: deploy `firestore:indexes` as a separately approved prerequisite and also isolate cleanup failure from paid-order effect dispatch/reconciliation — cost if wrong: cleanup may be delayed and raise a redacted alert, but already-paid customer recovery remains available.

Whole-branch review round 1: Ruling: permit one separately named, default-false controlled-owner lane only when the current token and current Admin user record both carry `companionOwner:true`, the authoritative UID/email exactly match the protected owner identity, every reviewed Payments capability is true, and both public flags remain false — cost if wrong: a stale or missing claim blocks the owner proof; no public fallback is provided.

Whole-branch review round 1: Ruling: treat App Check `appId` as an app-global identity, not a device/installation identity; use email digest, trusted IP, and an independently reachable app-global breaker without accepting a spoofable browser device ID — cost if wrong: valid-App-Check distributed traffic can exhaust the fail-closed global budget and delay sign-in mail, while it still cannot activate checkout or create an Invoice without the exact server gates.

Whole-branch review round 1: Ruling: persist a stable hash-only recipient/SKU/purpose quarantine independent of issuance bucket and require an explicit admin/App-Check resolution — cost if wrong: a false ambiguity blocks that recipient until reviewed, favoring duplicate-send prevention over availability.

Whole-branch review round 1: Ruling: map real Accounting aborts to redacted `PROVIDER_TIMEOUT`; after a potentially committed Customer or Invoice mutation, continue only from one exact bounded readback and otherwise enter terminal manual review — cost if wrong: eventual provider consistency may require manual reconciliation, but no blind duplicate mutation occurs.

Whole-branch review round 1: all 6 Important findings addressed with no open finding. Verification under Node 22: changed-scope focused tests 258/258 (including 96/96 focused QuickBooks provider/Invoice tests); Functions 505 pass/0 fail/2 emulator-only skips; Firestore+Storage emulator 507/507 with explicit project/account; storefront 35 unit + 4 browser; protected-commerce browser 34; Firebase browser runtime 9; syntax/diff clean; root production audit 0; Functions production audit 7 accepted moderate transitive findings and 0 high/critical; security checker found only classified synthetic fixtures/public Firebase configuration. No deployment, provider action, message, invoice, or payment occurred.

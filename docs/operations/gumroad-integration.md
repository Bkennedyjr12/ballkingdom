# Gumroad product integration

The existing Ballers Kingdom visual system and real logo are retained. Inspection remains available through footer/direct links; checkout runtime and provider configuration are unchanged.

The public Gumroad storefront was read on 2026-10-16 UTC. Its public storefront data reports exactly three published listings. Each matching public product page confirms publication, USD pricing, title, description and cover source:

| Product | Published price | Gumroad page |
| --- | --- | --- |
| The Recruiting Playbook | $29 USD | https://ballerskingdom.gumroad.com/l/gfjmoo |
| The Car Ride Home | $12 USD | https://ballerskingdom.gumroad.com/l/ofopvv |
| Business Readiness Scorecard Pro | $47 USD | https://ballerskingdom.gumroad.com/l/ejldv |

Original public product covers are copied locally without modification. They are PNGs, 1005 × 565. The homepage, Products and Shop present all three listings; Training presents the two sports resources; Readiness presents Scorecard Pro. Products separates available Gumroad downloads, personalized consulting and future resource previews. Links open the exact product pages in a new tab with noopener/noreferrer; no answers, member data, or form fields are transferred. Gumroad handles its checkout and downloads. No purchase or delivery transaction has been performed by this integration.

The full storefront link is also available, so visitors can see the seller's latest public listings: https://ballerskingdom.gumroad.com/.

## Add a future product

Update `scripts/gumroad-catalog.mjs` with verified public product details and its original cover. Catalog records generate all appropriate static page placements; all products appear on Home, Products and Shop, with audience-specific placement on Training or Readiness. Future audience types should receive an explicit placement decision. Keep draft/unpublished products out of the published catalog. Current price must be verified with the product page; Gumroad is the final price authority.

Run `node scripts/build-gumroad-sections.mjs`, then `node scripts/build-gumroad-sections.mjs --check`. The public-only packaging builder refuses stale generated sections. No runtime script or seller credential is needed to render the product cards. This is build-time synchronization, not automatic polling of the seller account.

Run `node --test tests/*.test.mjs` and `node node_modules/playwright/cli.js test --config tests/gumroad.config.mjs`. Browser coverage includes three widths across five pages, original cover loading, exact popup destinations with a null opener, and no-JavaScript availability. Source coverage pins the verified three-product inventory and prevents generated-page drift.

The Hosting candidate adds only one scoped stylesheet and three public covers, plus the reviewed marketing HTML/style changes. Deployment must use `firebase.site-preview.json` and `--only hosting:public` in `the-ballers-kingdom`/`ballkingdom-com`; never deploy the source root. No Functions, Rules, Auth, IAM, DNS, seller settings, payment configuration or email changes are included.

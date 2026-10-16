# Ballers Kingdom refinement

Goal: preserve the logo and monochrome identity, improve proportion and simplify discovery while keeping every tool available.

Base: isolated branch combines PR20 member/assessment/chat recovery source a3bd5e3 with main 17b3fc1. Keep assessment privacy disclosures and all sitemap routes. No backend, Auth, rules, payment configuration or DNS changes.

- [x] Audit source, live routes and current Gumroad product.
- [x] Consolidate static marketing navigation to Training, Consulting, Tools, Products, About and Book Consulting. Preserve specialized application controls.
- [x] Create categorized Tools directory. Keep inspection out of primary discovery and accessible once in footer.
- [x] Refine homepage hero, sections, CTAs and product preview without changing real brand assets.
- [x] Feature existing Gumroad Scorecard Pro; keep other products honest about availability and preserve commerce controls.
- [x] Correct mobile menu accessibility, active clean URLs and shared spacing/focus/reduced-motion rules.
- [ ] Verify desktop/mobile screenshots, navigation, tool links, source tests, sensitive-output exclusions and independent review.
- [ ] Stage a clean public-only preview and focused PR. Production release requires approval after reviewable evidence.

Checks: 117 baseline root tests pass. Browser acceptance: no header/document overflow at 360/390/768/1024/1440; usable mobile menu with Escape and link-close; no inspection primary link; every directory destination exists; existing specialized application tests pass. Check source plus response type rather than HTTP200 alone.

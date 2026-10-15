# Agent City and geographic Ecosystem map

## Release scope

Repository: Bkennedyjr12/ballkingdom. Existing Firebase project: `the-ballers-kingdom`. Public target: `public` / site `ballkingdom-com`. Public routes: `/technology`, `/agent-city`, `/ecosystem-city`. Homepage and consulting page link to the service; new pages reuse the existing fonts, black/charcoal/white palette, logos and main navigation.

This release is Hosting-only. It does not modify or deploy Functions, Firestore rules/indexes, Storage rules, IAM, secrets, or commerce state. The existing source has other reviewed/undeployed backend work: do not use an unscoped `firebase deploy`.

After authenticating the Firebase project owner and confirming target mapping:

```bash
firebase deploy --only hosting:public --project the-ballers-kingdom
```

Validate successful release output and independently fetch `/technology`, `/agent-city`, `/ecosystem-city`, associated CSS/JS and existing homepage. Confirm actual city search, selecting a city, map pan/zoom, loading places, filters and place details. Confirm mobile navigation and agent tabs. Preserve the existing redirect hosting site.

## Implemented behavior

- Geographic Leaflet 1.9.4 map starts in Ontario, California; OSM street tiles include required attribution.
- Explicit city search uses Nominatim. No autocomplete, bulk queries, background city scanning or automatic place crawling. Search results require selection; browser session caches searches and rate limits them.
- Explicit place loading uses bounded Overpass requests, limited to a neighborhood and 200 places, with a cooldown, five-minute session cache, timeout, error states and stale-request protection. Moving the map requires another explicit load.
- Listings are categorized and selectable through accessible directory buttons as well as markers. Names and source content render as text, never trusted HTML.
- Place source, retrieval timestamp, coverage limitations and unverified participation remain visible. Retrieval time is not verification or real-time source freshness.
- Potential support pathways and the public Connect a Business Owner page are provided. No referral is silently submitted.
- Agent City is a clearly labeled demonstration. Proposed tool roles are unverified. Assignments are local browser records; no agent dispatch occurs.
- Public geography is not private CRM data or verified Ecosystem participation. No paid map vendor, Apple imagery or 3D photorealistic data is configured.

## Remaining connections

Real agent telemetry and private deal/resource records require an authenticated, tenant-scoped backend and the actual agent adapters/CRM source. Do not publish private data in static assets. Suggested future event contract: workspaceId, agentId, runId, districtId, businessId (optional), state, taskSummary (redacted), occurredAt, heartbeatAt, sourceSystem, sourceRecordId, permissionScope. A missing heartbeat should show offline/unknown, not active. Consequential dispatches require server authorization and auditable human approval where applicable.

The exact existing Entrepreneur Ecosystem relationship-map stages have not been retrieved. Existing demonstration pipeline stages must not become canonical stages until compared to that source.

For broad production traffic, configure a commercial/self-hosted geocoder and places service with project-level quotas/caching. Current public endpoints have no SLA and may refuse requests. Geography is read-only and failure leaves an explicit unavailable state; no synthetic places replace failures.

## Verification

`node --check assets/js/ecosystem-city.js`
`node --check assets/js/agent-city.js`
`node --test tests/ecosystem-city.test.mjs tests/storefront-html.test.mjs tests/product-catalog.test.mjs tests/product-artifact-hosting.test.mjs`

41 tests passed. Browser visual QA and Firebase deployment require the relevant enabled surface/authentication; do not label them complete without evidence.

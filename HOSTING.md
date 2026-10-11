# Ball Kingdom hosting map

Single source of truth for what serves each domain, and from where.
All hosting is Firebase project **`the-ballers-kingdom`**. GoDaddy is the
registrar and DNS only — it hosts nothing.

## Domains

| Domain | Firebase site | Content lives in | Notes |
| --- | --- | --- | --- |
| `ballkingdom.com` | `ballkingdom-com` | this repo, root | main public site |
| `www.ballkingdom.com` | `ballkingdom-com` | — | 301 → apex |
| `theballerskingdom.com` | `theballerskingdom-redirect` | `hosting/theballerskingdom-redirect/` | 301 → ballkingdom.com |
| `www.theballerskingdom.com` | `theballerskingdom-redirect` | — | same |
| `companion.ballkingdom.com` | `companion-ballkingdom` | **inspector repo** (see below) | Inspector's Field Notes PWA |
| `shop.ballkingdom.com` | — | Shopify | third-party store, not Firebase |
| `the-ballers-kingdom.web.app` | `the-ballers-kingdom` | — | inspector placeholder site |

Mail is Microsoft 365 (`info@ballkingdom.com`) via MX + SPF on
`ballkingdom.com`. **DNS work must never touch MX, SPF, or the
`autodiscover` / `sip` / `lyncdiscover` / `msoid` CNAMEs.**

## Deploying

**October 11, 2026 cleanup-only release:** Brian approved removing exposed
internal artifacts while preserving the public website. Live version
`4a80d522cc70cc38` retains all 171 ordinary hashes and the exact Hosting config,
and omits 1,318 internal paths. The sanitized rollback version is
`87fe2cf57d72b0c5`; older rollback versions can restore the exposure. See
[`hosting-cleanup-release.md`](docs/operations/hosting-cleanup-release.md)
for release evidence, regression results and safe rollback.

Assessment/commerce feature publication and a cloud feature preview remain held.
Do not reconstruct `ballkingdom-com` by deploying the repository root. Reconcile
the feature builder's historical baseline to the clean live manifest before a
future reviewed release. The older additive manifest includes internal artifacts
and must never be published. See
[`base44-ai-readiness-integration.md`](docs/operations/base44-ai-readiness-integration.md)
and [`hosting-artifact-review-checkpoint.md`](docs/operations/hosting-artifact-review-checkpoint.md)
for historical findings and the unresolved Library/iOS feature-review blocker.

This repo's `firebase.json` covers two sites. Deploy them by target/site so a
careless full deploy cannot overwrite something unintended:

    # main public site: further feature publication held; reconcile clean baseline first

    # theballerskingdom.com redirect
    firebase deploy --only hosting:theballerskingdom-redirect --project the-ballers-kingdom

### companion.ballkingdom.com is deliberately NOT in this config

Its built output lives in the public repo
`Bkennedyjr12/ball-kingdom-class-companion`, and its Firebase config is wired
into the inspector repo `Bkennedyjr12/home-inspection-upgrade` at
`hosting/companion-ballkingdom/`. Deploy it with the `deploy.sh` there.

It is excluded here on purpose: if it were listed with a `public` directory
that does not exist in this repo, a plain `firebase deploy --only hosting`
would publish an empty site over the live PWA.

## Migration history (2026-08)

Moved off GitHub Pages and GoDaddy onto Firebase:

- `theballerskingdom.com` — was GoDaddy Domain Forwarding (301) on GoDaddy's
  AWS Global Accelerator. Now a Firebase redirect site. Improvement: every
  path 301s, where GoDaddy returned 404 on anything but `/`.
- `companion.ballkingdom.com` — was GitHub Pages from
  `ball-kingdom-class-companion`. Firebase copy verified byte-identical on
  `/`, `/manifest.webmanifest`, `/sw.js`, `/404.html` before cutover.
- `ballkingdom.com` — was GitHub Pages.

After each cutover, disable GitHub Pages on the source repo so Pages and
Firebase do not contend for the domain or its certificate.

## Cutover procedure (learned the hard way)

Firebase's "Needs setup" means **DNS does not point at Firebase yet**, not
"ownership unverified". A TXT record alone will not let it mint a
certificate, so a domain cannot be pre-verified before moving traffic.

The working order is:

1. Point DNS at Firebase (A `199.36.158.100` for an apex, CNAME to the
   `<site>.web.app` for a subdomain).
2. Wait for propagation (keep TTL at 600 during a migration).
3. In the console, click the domain's **Needs setup** button, then **Verify**.
   This step is required and easy to miss — nothing mints without it.
4. Status becomes **Minting certificate**. The domain is unreachable over
   HTTPS until the certificate issues.

Rollback is a DNS revert, bounded by the 600s TTL.

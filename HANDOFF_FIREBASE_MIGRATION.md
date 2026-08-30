# Handoff — Ball Kingdom → Firebase migration

**State captured:** 2026-08-29 22:54 PDT, by direct measurement (dig against
GoDaddy's authoritative nameservers + live TLS/HTTP checks), not from memory.

**Hosting migration is COMPLETE.** All five hostnames serve from Firebase with
valid per-hostname certificates. Nothing is hosted on GitHub Pages or GoDaddy
any more. What remains is cleanup and an optional DNS/registrar move.

---

## 1. Verified current state

| Hostname | HTTP | Certificate CN | Serves |
| --- | --- | --- | --- |
| `ballkingdom.com` | 200 | `ballkingdom.com` | main site, Firebase site `ballkingdom-com` |
| `www.ballkingdom.com` | 301 → apex | `www.ballkingdom.com` | redirect, same site |
| `theballerskingdom.com` | 301 → `ballkingdom.com` | (SNI-shared) | Firebase site `theballerskingdom-redirect` |
| `www.theballerskingdom.com` | 301 | (SNI-shared) | same |
| `companion.ballkingdom.com` | 200 | `companion.ballkingdom.com` | Firebase site `companion-ballkingdom` — Inspector's Field Notes PWA |
| `shop.ballkingdom.com` | 404 | `shop.ballkingdom.com` | **Shopify — intentionally NOT Firebase.** See §5. |

DNS (authoritative, `ns07.domaincontrol.com`):

```
ballkingdom.com.        A      199.36.158.100     (exactly one A record)
www.ballkingdom.com.    CNAME  ballkingdom-com.web.app.
ballkingdom.com.        MX     0 ballkingdom-com.mail.protection.outlook.com.
```

Firebase project: **`the-ballers-kingdom`**. Firebase CLI and console are
authenticated as **`lilpelejr12@gmail.com`** (NOT the @ampac.com account —
this is personal-business work, keep it that way).

---

## 2. What is still open

### 2a. Disable GitHub Pages (do this first — it is the last non-Firebase hosting)

Two public repos still have Pages enabled and still serve the migrated content.
DNS no longer points at them, so this is safe, but leaving Pages on means two
providers claim the same hostnames and can contend over ACME/certificates.

- `Bkennedyjr12/ballkingdom` — Settings → Pages → set Source to **None**.
  Also delete the root `CNAME` file (contains `ballkingdom.com`).
- `Bkennedyjr12/ball-kingdom-class-companion` — Settings → Pages → **None**.
  Also delete its root `CNAME` (contains `companion.ballkingdom.com`).

**Verify after:** `curl -sI https://ballkingdom.com | grep -i server` must NOT
say `GitHub.com`. It currently does not — confirm it still does not.

### 2b. Move DNS to Google Cloud DNS (the high-value step)

Firebase does not offer DNS or domain registration — those products do not
exist, so "only Firebase" is not literally achievable. The closest real thing:
run DNS from **Cloud DNS in the same GCP project as Firebase**
(`the-ballers-kingdom`). GoDaddy then does nothing but hold the registration.

Why it matters: DNS becomes `gcloud`-manageable from the CLI. Tonight's outage
was caused by a GoDaddy web-form validation error ("Invalid data provided for
record data") after deleting the old A records — the apex had **zero** A
records for several minutes. CLI-managed DNS removes that whole failure class.

Procedure (do NOT shortcut — mail is on this zone):

1. `gcloud dns managed-zones create ballkingdom --dns-name=ballkingdom.com. --project=the-ballers-kingdom`
2. Recreate **all 23 records** from GoDaddy. Full list in `HOSTING.md` §DNS and
   in the GoDaddy export. Critical ones that must not be missed:
   - `MX 0 ballkingdom-com.mail.protection.outlook.com.`
   - `TXT v=spf1 include:spf.protection.outlook.com ~all`
   - CNAMEs `autodiscover`, `email`, `lyncdiscover`, `msoid`, `sip`
   - SRV `_sip._tls`, `_sipfederationtls._tcp`
   - `TXT hosting-site=ballkingdom-com` (Firebase ownership)
   - `CNAME shop → shops.myshopify.com.` (Shopify store)
   - `CNAME companion → companion-ballkingdom.web.app.`
3. **Verify the new zone answers correctly BEFORE switching nameservers:**
   `dig @$(gcloud dns managed-zones describe ballkingdom --format='value(nameServers[0])') ballkingdom.com MX`
   Compare every record against GoDaddy's zone. A missed MX record = mail
   outage, which is far worse than a website outage.
4. Only then change nameservers at GoDaddy to the four Cloud DNS servers.
5. Watch mail specifically for 24h after the switch.

Stale records worth dropping during the rebuild (do not copy them over):
`_acme-challenge.www`, `_cf-custom-hostname`, `_cf-custom-hostname.www` —
leftovers from an earlier Cloudflare-for-SaaS setup.

### 2c. Optional — transfer registration off GoDaddy

`ballkingdom.com` expires **2027-05-11**, renewal **$22.99/yr** at GoDaddy.
Cloudflare Registrar sells at cost (~$11/yr).

**Blocker:** the domain currently carries GoDaddy's standard locks —
`clientTransferProhibited`, `clientUpdateProhibited`, `clientDeleteProhibited`.
Must be unlocked and an auth/EPP code requested before any transfer. Takes
5–7 days. Do this only after 2b is stable.

---

## 3. Repo / config state

Two repos, both pushed:

- **`Bkennedyjr12/ballkingdom`** (`~/Documents/GitHub/ballkingdom-current`) —
  canonical. Main site content at repo root. `firebase.json` covers two sites
  (`public` target → ballkingdom.com, and `theballerskingdom-redirect`).
  `HOSTING.md` is the domain→site→content map. Commit `42a7391`.
- **`Bkennedyjr12/home-inspection-upgrade`** (private; local tree lives at
  `~/Desktop/Desktop - Brian's MacBook Pro/home-inspection-upgrade`) — the
  inspector platform + the M365/QuickBooks provider integration
  (`feature/canonical-firebase-platform`, HEAD `a504bb1`, 42 commits).
  `hosting/companion-ballkingdom/` holds the companion PWA's Firebase config
  and `deploy.sh`. Commit `3ab812d`.

Deploy commands:

```
# main site
cd ~/Documents/GitHub/ballkingdom-current
firebase deploy --only hosting:public --project the-ballers-kingdom

# theballerskingdom.com redirect
firebase deploy --only hosting:theballerskingdom-redirect --project the-ballers-kingdom

# companion PWA (clones built output from ball-kingdom-class-companion)
cd "$HOME/Desktop/Desktop - Brian's MacBook Pro/home-inspection-upgrade/hosting/companion-ballkingdom"
./deploy.sh
```

`companion-ballkingdom` is deliberately **excluded** from the main repo's
`firebase.json`: its `public` dir does not exist there, so listing it would let
a plain `firebase deploy --only hosting` publish an empty site over the live PWA.

---

## 4. Hard-won gotchas (do not rediscover these)

1. **Firebase "Needs setup" means DNS does not point at Firebase yet** — not
   "ownership unverified". A TXT record alone will not let it mint. A domain
   therefore **cannot** be pre-verified before moving traffic; the downtime
   window is unavoidable.
2. **The console dialog has BOTH a `Verify` and a `Finish` button.** Clicking
   Verify and then closing the dialog leaves the domain stuck at "Needs setup".
   You must click **Finish**. This cost ~40 minutes tonight.
3. **Stale ACME errors.** After fixing DNS, the dialog keeps displaying the
   previous failure (old IPs). Firebase re-runs on its own schedule; there is
   no force-retry button. Do not chase it.
4. **`Server: Varnish` is Firebase's edge**, not GitHub. Do not use it to infer
   which provider is answering — check the resolved IP (`%{remote_ip}`) instead.
5. **Certificate timing is unpredictable.** `theballerskingdom.com` ~10h,
   `companion` ~12h, but `ballkingdom.com` minted in **~15 minutes**. Plan for
   hours, hope for minutes; cut over at low-traffic times regardless.
6. **GoDaddy's add-record form breaks after deletions in the same session.**
   Reload the page before adding. An empty second "value" row also triggers
   "Invalid data provided for record data".
7. **GoDaddy Domain Forwarding injects its own A records** and overrides manual
   ones. Delete the forwarding rule before adding A records or GoDaddy wins.
8. **`gcloud auth application-default login --scopes=...forms.body` is blocked
   by Google** ("This app is blocked") — restricted scope, gcloud's shared
   client cannot request it. Use Apps Script for Forms work instead.

---

## 5. Explicitly out of scope / decided

- **`shop.ballkingdom.com` stays on Shopify.** Confirmed by Brian. It is a
  storefront platform, not hosting to migrate. Its 404 is Shopify's, expected.
- **Four dead domains stay dead** — `bkjr12.com`, `eebkjr.io`, `archubx.com`,
  `bkjr.me` do not resolve. Brian's decision: no need for them.
  **However** they are still linked from the live Google intake form, so
  clients see dead links. Stripping those links is open work (§6).
- **Firebase as registrar/DNS host is not possible.** Not a limitation of this
  setup — the product does not exist.

---

## 6. Unrelated open items (same business, different track)

- **Google Forms.** Two live forms, both rebuilt 2026-08-24 with a proper
  consent architecture: Intake & Consent (one-time, 49 items,
  `1UOj2qq-rUAsBSQDzSLI62MvE1SxG8fDbEthqF37I8ek`) and Session Booking Request
  (12 items, `15T2EdJUvKAf79vqzsCpxoSuUiRiceff8iiMgBR4-Ttc`).
  - **No human has completed either form end-to-end since the rebuild.** A
    manual walkthrough is the right acceptance gate and is still outstanding.
  - Attorney review of the release / media-NIL / minor-guardian wording is
    still open. See `FORM_1ON1_LEGAL_STRUCTURE_V2.md`; `[COUNSEL]` markers show
    exactly what needs a ruling.
  - Dead-domain links still present in the form header (see §5).
- **Provider integration is built but dark.** M365 calendar/mail + QuickBooks
  invoicing, default-off, never deployed, no provider ever contacted. Its own
  release gates remain open: Java/emulator evidence, Node 22 clean-install
  parity, dependency-audit disposition, clean-source packaging, authorized
  live provider/IAM validation.
- **Repo consolidation.** Two repos with seven overlapping Ballers branches is
  the root cause of most confusion here. Recommendation: `ballkingdom` is
  canonical (it has the live Firebase project and hosting targets); fold the
  provider work into it and retire `home-inspection-upgrade` as a Ballers home.
- **Runaway scans.** `find ~ ...` walks into the OneDrive/ShareFile network
  mounts under `~/Library/CloudStorage` and wedges for days. Always prune:
  `find ~ -path ~/Library/CloudStorage -prune -o -name '<pat>' -print`.

---

## 7. Environment notes

- CDP browser automation: `bash ~/.chrome-automation/launch-native-cdp.sh 9222`.
  Port 9222 was **deliberately closed** by the 2026-08-18 security freeze; it
  was reopened tonight for this work and **should be closed again**
  (`pkill -f "user-data-dir=$HOME/.chrome-automation"`).
- The automation Chrome profile is **logged into Firebase console** but **NOT
  into GoDaddy** (analytics cookies only). GoDaddy work must be done by hand or
  from Brian's "Work" Chrome profile.
- That profile also holds AmPac Ventures/Gateway sessions — borrower NPI.
  Do not mix AmPac work into this personal-business automation.

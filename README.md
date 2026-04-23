# The Ballers Kingdom — ballkingdom.com

Static website for The Ballers Kingdom. Hosted free on **GitHub Pages**. Domain managed at **GoDaddy**. Email on **Microsoft 365** (already active on `info@ballkingdom.com`).

**Primary domain:** `ballkingdom.com` (canonical)
**Backup domain:** `theballerskingdom.com` → 301 redirect to `ballkingdom.com`

---

## Project structure

```
tbk-website/
├── index.html           Home
├── soccer.html          Soccer Training (primary service)
├── yvp.html             Youth Venture Program
├── about.html           Meet Brian
├── contact.html         Consultation request + contact
├── 404.html             Not found
├── CNAME                Tells GitHub Pages to serve on ballkingdom.com
├── robots.txt
├── sitemap.xml
└── assets/
    ├── css/styles.css
    ├── js/main.js
    └── img/             Photos + training video
```

No build step. No dependencies. Open `index.html` in a browser to preview locally.

---

## Part 1 — Deploy to GitHub Pages (free)

### 1.1 Create the repo
1. Sign in to GitHub. If you don't have an account, create one with your `info@ballkingdom.com` address — or any address for now.
2. Click **New repository**.
3. Name it `ballkingdom` (or any name — public).
4. Set it to **Public**.
5. Do NOT initialize with README (we already have one).
6. Click **Create repository**.

### 1.2 Push this project to the repo
From this folder, in your terminal:

```bash
git init
git add .
git commit -m "Initial launch — The Ballers Kingdom"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ballkingdom.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### 1.3 Enable GitHub Pages
1. In the repo, go to **Settings → Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Branch: `main`, Folder: `/ (root)`. Click **Save**.
4. Wait ~1 minute. GitHub will show the temp URL (something like `YOUR_USERNAME.github.io/ballkingdom`).
5. In the **Custom domain** box, enter: `ballkingdom.com` → Save.
6. Check the **Enforce HTTPS** box once it's available (can take up to 15 minutes after DNS propagates).

GitHub reads the `CNAME` file in this repo and wires the custom domain automatically.

---

## Part 2 — Point ballkingdom.com at GitHub Pages (GoDaddy DNS)

Sign in to GoDaddy → **My Products** → find `ballkingdom.com` → click **DNS**.

### 2.1 Delete any conflicting records
- Delete existing `A` records for `@` if they don't point to GitHub.
- Delete any existing `CNAME` for `www` that points to GoDaddy parking.
- Leave MX records alone for now (we'll set those in Part 4).

### 2.2 Add the four GitHub Pages A records (apex domain)
Add **four separate A records**, all for host `@`:

| Type | Name | Value          | TTL    |
| ---- | ---- | -------------- | ------ |
| A    | @    | 185.199.108.153 | 1 Hour |
| A    | @    | 185.199.109.153 | 1 Hour |
| A    | @    | 185.199.110.153 | 1 Hour |
| A    | @    | 185.199.111.153 | 1 Hour |

### 2.3 Add the www CNAME

| Type  | Name | Value                       | TTL    |
| ----- | ---- | --------------------------- | ------ |
| CNAME | www  | YOUR_USERNAME.github.io     | 1 Hour |

(Replace `YOUR_USERNAME` with your GitHub username — no trailing slash, no `https://`.)

### 2.4 Wait and verify
DNS propagation takes 10 minutes to a few hours. Once it's done, `https://ballkingdom.com` and `https://www.ballkingdom.com` should both show your site.

---

## Part 3 — Set up 301 redirect: theballerskingdom.com → ballkingdom.com

Sign in to GoDaddy → **My Products** → find `theballerskingdom.com`.

1. Click **Manage DNS** → look for **Forwarding** (or **Domain Forwarding**). If not visible, go to the domain's settings page and find **Forward your domain**.
2. Set:
   - **Forward to:** `https://ballkingdom.com`
   - **Forward type:** **Permanent (301)**
   - **Settings:** **Forward only** (do NOT turn on masking — masking breaks SEO and SSL)
3. Save. GoDaddy typically applies in 15–60 minutes.

That makes `theballerskingdom.com` and `www.theballerskingdom.com` both 301-redirect to `ballkingdom.com`, consolidating SEO and visitor traffic to the primary brand.

---

## Part 4 — Email: Microsoft 365 (already active)

Brian's `info@ballkingdom.com` inbox runs on **Microsoft 365**, not Zoho. The MX, SPF/DKIM/DMARC, and autodiscover records were already in place on GoDaddy DNS before the site launch, so nothing to change on the primary domain for mail to keep flowing.

### 4.1 Existing M365 records on ballkingdom.com (do not delete)
GoDaddy DNS for `ballkingdom.com` already has Microsoft's required records:

- **MX** `@` → `ballkingdom-com.mail.protection.outlook.com` (priority 0)
- **TXT** `@` → `MS=msXXXXXXXX` (M365 domain verification)
- **CNAME** `autodiscover` → `autodiscover.outlook.com`
- **CNAME** `selector1._domainkey` / `selector2._domainkey` → M365 DKIM
- **TXT** `_dmarc` → DMARC policy
- Domain-connect CNAMEs wired by Microsoft

When doing the GitHub Pages DNS work in Part 2, only the `A @` and `CNAME www` records are modified. Leave everything above alone.

### 4.2 SPF — confirm it covers Microsoft 365
In GoDaddy DNS for `ballkingdom.com`, find the `TXT @` record starting with `v=spf1`. It should look like:

```
v=spf1 include:spf.protection.outlook.com -all
```

If it's the GoDaddy default (`v=spf1 include:secureserver.net -all`), edit it to the M365 value above. Only **one** SPF record should exist on the domain — never add a second.

### 4.3 Adding info@theballerskingdom.com as an M365 alias (optional)
If Brian wants mail sent to `info@theballerskingdom.com` to land in the same inbox:

1. In **admin.microsoft.com** → **Settings → Domains → Add domain** → enter `theballerskingdom.com`.
2. M365 gives you a TXT verification value. Add it in GoDaddy DNS **for theballerskingdom.com**.
3. After verification, M365 prompts for MX + autodiscover + DKIM records — add them in GoDaddy DNS for `theballerskingdom.com`.
4. In M365 Admin: **Users → Active users → [Brian] → Manage username and email → Aliases** → add `info@theballerskingdom.com`.

> Alternative: skip the alias and rely on Part 3's 301 redirect. Anyone who types `theballerskingdom.com` in a browser lands on `ballkingdom.com`, but email to `info@theballerskingdom.com` without the alias configured will bounce.

### 4.4 Why Part 3 (domain forwarding) doesn't break email
GoDaddy's domain forwarding uses **Forward only** mode by default, which preserves DNS records — MX, TXT, CNAME all continue to resolve. Only unhandled HTTP requests are 301-redirected. If email for the secondary domain ever stops working, check that masking is OFF (masking breaks SSL and DNS).

---

## Part 5 — Contact form (no backend, no signup)

The contact form in `contact.html` uses a **mailto handler** — zero backend, zero services, zero signups.

How it works: when a visitor fills out the form and clicks **Request Consultation**, a small piece of JavaScript packages the answers (name, email, phone, interest, athlete's age, message) into a formatted email and opens the visitor's default email client (Apple Mail, Outlook, Gmail on mobile, etc.) with everything pre-filled and addressed to `info@ballkingdom.com`. The visitor taps send, and the message lands in Brian's M365 inbox like any other email.

Why this over a form service (Formspree, Netlify Forms, etc.):
- No account to create, no free-tier limit to hit, no vendor lock-in.
- Replies come from the visitor's real email address, so Brian can just hit "Reply" in Outlook.
- No CAPTCHA or spam-filter middleware needed — Microsoft 365's built-in spam filtering catches junk.
- Works forever with zero maintenance.

Trade-off: if a visitor's device doesn't have an email client configured (rare on desktop, more common on locked-down mobile), the mailto link won't open. The form note above the fields tells visitors clearly what will happen, and the page also shows the email address, Instagram, and YouTube handle so visitors always have a direct path to reach out.

---

## Part 6 — Calendly (optional, free tier)

Want 1-click consultation booking?

1. Sign up at **calendly.com** with `info@ballkingdom.com` (free plan: 1 event type).
2. Create a "Consultation" event (30 min).
3. In `contact.html`, find the commented-out Calendly block (HTML comment around line ~55) and uncomment it. Replace `YOUR-USERNAME` with your Calendly handle.
4. Re-push to GitHub.

---

## Part 7 — Ongoing updates

Text, photos, or page changes:

**Option A — ask me or the AmPac AI CTO.** Tell me what to change, I'll edit the file and help you push.

**Option B — edit locally.** HTML and CSS files are plain text. Open them in any editor (VS Code, TextEdit, Notepad), save, then:
```bash
git add .
git commit -m "Update copy on soccer page"
git push
```
GitHub Pages rebuilds within 1–2 minutes.

**Option C — edit directly on GitHub.** Any file can be edited in the browser with a pencil icon. Commit, and the site updates.

---

## Checklist (follow in order)

- [x] Part 1.1–1.3 — Create GitHub repo, push, enable Pages
- [x] Part 2 — Add 4 A records + www CNAME at GoDaddy for ballkingdom.com
- [ ] Verify https://ballkingdom.com loads
- [ ] Enable "Enforce HTTPS" in GitHub Pages settings
- [ ] Part 3 — Configure theballerskingdom.com → ballkingdom.com 301 redirect
- [x] Part 4 — Email on Microsoft 365 (info@ballkingdom.com already active)
- [ ] Part 4.2 — Confirm SPF record includes `spf.protection.outlook.com` (update if still set to secureserver.net)
- [ ] Part 4.3 — (optional) Add theballerskingdom.com to M365 + info@theballerskingdom.com alias
- [x] Part 5 — Contact form uses mailto handler (no backend or signup required)
- [ ] Part 6 — (optional) Connect Calendly
- [ ] Test: navigate to theballerskingdom.com and confirm it redirects to ballkingdom.com
- [ ] Test: send an email to info@ballkingdom.com from a third address and confirm it arrives in the M365 inbox

---

## Contact for build support

Maintained with Brian by the AmPac Entrepreneur Ecosystem's AI CTO.

Last updated: April 2026.

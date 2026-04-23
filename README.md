# The Ballers Kingdom — ballkingdom.com

Static website for The Ballers Kingdom. Hosted free on **GitHub Pages**. Domain managed at **GoDaddy**. Email on **Zoho Mail** free tier.

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
1. Sign in to GitHub. If you don't have an account, create one with your `brian@ballkingdom.com` address once Zoho is set up — or any address for now.
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

## Part 4 — Email: Zoho Mail free tier

Zoho Mail's free plan: 1 user, 5 GB, custom domain. Perfect for `brian@ballkingdom.com`.

### 4.1 Sign up for Zoho Mail
1. Go to **zoho.com/mail** → sign up → choose the **Forever Free Plan** (5 GB, 1 user, 1 domain).
2. When prompted for a domain, enter `ballkingdom.com`.

### 4.2 Verify domain ownership
Zoho will give you a TXT record to add at GoDaddy.

In GoDaddy DNS for `ballkingdom.com`:

| Type | Name            | Value                        | TTL    |
| ---- | --------------- | ---------------------------- | ------ |
| TXT  | @ (or zb_code)  | (the zoho-verification value) | 1 Hour |

Return to Zoho → click **Verify** once the record is saved.

### 4.3 Create your mailbox
Create: `brian@ballkingdom.com`. Set a strong password.

### 4.4 Add Zoho MX records in GoDaddy
Delete any existing MX records for `ballkingdom.com`, then add:

| Type | Name | Priority | Value              | TTL    |
| ---- | ---- | -------- | ------------------ | ------ |
| MX   | @    | 10       | mx.zoho.com        | 1 Hour |
| MX   | @    | 20       | mx2.zoho.com       | 1 Hour |
| MX   | @    | 50       | mx3.zoho.com       | 1 Hour |

### 4.5 Add SPF + DKIM (prevents your emails from going to spam)
Also in GoDaddy DNS for `ballkingdom.com`:

**SPF (TXT):**

| Type | Name | Value                                      |
| ---- | ---- | ------------------------------------------ |
| TXT  | @    | `v=spf1 include:zoho.com ~all`             |

**DKIM:** Zoho will generate a DKIM record inside its admin panel (Mail Admin → Domains → DKIM). Copy the TXT record they give you and paste it into GoDaddy — the host will be something like `zoho._domainkey`.

### 4.6 Forwarder from theballerskingdom.com
Once the primary mailbox is working, add the forwarder:

1. In Zoho admin, go to **Domains** → **Add Domain** → enter `theballerskingdom.com`.
2. Verify that domain the same way (TXT record in GoDaddy DNS **for theballerskingdom.com**).
3. Once verified, in Zoho admin → **Mail Accounts** → your user → **Aliases** → add alias `brian@theballerskingdom.com`.
4. Confirm MX records in GoDaddy DNS for `theballerskingdom.com` also point to Zoho (same three MX entries as 4.4).

Now mail sent to **either** `brian@ballkingdom.com` or `brian@theballerskingdom.com` lands in the same inbox. The primary is `brian@ballkingdom.com`.

> Note: if you forwarded `theballerskingdom.com` to `ballkingdom.com` in Part 3, **Forward only** mode preserves DNS records — MX and TXT still work. If web requests stop working for the secondary domain's email, it usually means masking was accidentally enabled. Make sure Part 3 used **Forward only**, not **Forward with masking**.

---

## Part 5 — Contact form (Formspree free tier)

The contact form in `contact.html` points at a Formspree endpoint. Formspree free plan: 50 submissions/month, no backend required.

1. Go to **formspree.io** → sign up with `brian@ballkingdom.com`.
2. Create a new form. Copy the endpoint URL (looks like `https://formspree.io/f/abcd1234`).
3. In `contact.html`, find `YOUR_FORMSPREE_ID` and replace with your actual form ID.
4. Re-push to GitHub: `git add contact.html && git commit -m "Wire contact form" && git push`.

Submissions will arrive at `brian@ballkingdom.com`.

---

## Part 6 — Calendly (optional, free tier)

Want 1-click consultation booking?

1. Sign up at **calendly.com** with `brian@ballkingdom.com` (free plan: 1 event type).
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

- [ ] Part 1.1–1.3 — Create GitHub repo, push, enable Pages
- [ ] Part 2 — Add 4 A records + www CNAME at GoDaddy for ballkingdom.com
- [ ] Verify https://ballkingdom.com loads
- [ ] Enable "Enforce HTTPS" in GitHub Pages settings
- [ ] Part 3 — Configure theballerskingdom.com → ballkingdom.com 301 redirect
- [ ] Part 4 — Sign up for Zoho Mail free tier, verify ballkingdom.com
- [ ] Part 4 — Add MX + SPF + DKIM records, create brian@ballkingdom.com
- [ ] Part 4.6 — Add theballerskingdom.com to Zoho, create brian@theballerskingdom.com alias
- [ ] Part 5 — Wire up Formspree for the contact form
- [ ] Part 6 — (optional) Connect Calendly
- [ ] Test: send an email from a third address to both brian@ballkingdom.com and brian@theballerskingdom.com and confirm both arrive
- [ ] Test: navigate to theballerskingdom.com and confirm it redirects to ballkingdom.com

---

## Contact for build support

Maintained with Brian by the AmPac Entrepreneur Ecosystem's AI CTO.

Last updated: April 2026.

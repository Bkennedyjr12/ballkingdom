# Ballers Kingdom — AI Analysis Proxy (optional backend)

The Readiness Scorecard works **fully without this**. It ships smart,
rule-based analysis that runs in the browser — no key, no server, no cost.

Deploy this Cloudflare Worker only when you want **true LLM-written**
analysis (Claude generating the narrative instead of the built-in rules).

## Why a backend at all?

An AI API key (Anthropic/OpenAI) is tied to your billing. If it lived in
the website's JavaScript, anyone could view-source it and run up your bill.
The Worker keeps the key server-side as a secret and proxies the calls.

## One-time setup (~15 min)

1. **Get an Anthropic API key** → https://console.anthropic.com/
   (Add a small spend limit so there are no surprises.)

2. **Install Wrangler** (Cloudflare's CLI):
   ```bash
   npm install -g wrangler
   wrangler login
   ```

3. **Deploy the Worker** from this folder:
   ```bash
   cd backend
   wrangler deploy
   ```
   Wrangler prints a URL like `https://bk-ai.<your-subdomain>.workers.dev`.

4. **Add your key as a secret** (never committed to git):
   ```bash
   wrangler secret put ANTHROPIC_API_KEY
   # paste your key when prompted
   ```

5. **Turn it on in the site.** In `assets/js/readiness-app.js`, set:
   ```js
   var AI_ENABLED = true;
   var AI_PROXY_URL = 'https://bk-ai.<your-subdomain>.workers.dev';
   ```
   Commit + push. Done.

## What it guarantees

- CORS locked to ballkingdom.com (and the .com variants).
- Per-IP rate limiting (8 req/min) to protect your spend.
- A system prompt that forces **educational, compliance-safe** language:
  no guaranteed approvals, rates, or amounts; "may / could / eligible".
- Only structured scores + an optional goal note are sent — never raw PII.

## Cost

Claude 3.5 Haiku is inexpensive (fractions of a cent per analysis).
Cloudflare Workers free tier covers ~100k requests/day. For a lead tool,
expect this to cost roughly nothing.

## Rollback / off switch

Set `AI_ENABLED = false` in `readiness-app.js` and the tool instantly
falls back to the built-in rule-based analysis. The Worker can stay
deployed or be deleted (`wrangler delete`).

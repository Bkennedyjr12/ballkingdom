/**
 * The Ballers Kingdom — AI analysis proxy (Cloudflare Worker)
 * ------------------------------------------------------------
 * OPTIONAL backend. The Readiness Scorecard works fully WITHOUT this
 * (it ships rule-based analysis in the browser). Deploy this only when
 * you want true LLM-written analysis.
 *
 * What it does:
 *   - Holds your Anthropic API key as a SECRET (never in the browser).
 *   - Accepts a POST from readiness.html with the user's scores/answers.
 *   - Calls Claude, returns a short tailored analysis as JSON.
 *   - Rate-limits per IP and locks CORS to ballkingdom.com.
 *
 * It NEVER returns financing decisions or guarantees — the system prompt
 * forces educational, compliance-safe language.
 *
 * ---- DEPLOY (≈15 min, one time) ----
 *   1. Create an Anthropic API key:  https://console.anthropic.com/
 *   2. Install Wrangler:             npm i -g wrangler  (and `wrangler login`)
 *   3. From this backend/ folder:    wrangler deploy
 *   4. Set the secret:               wrangler secret put ANTHROPIC_API_KEY
 *   5. Copy the deployed URL (e.g. https://bk-ai.<you>.workers.dev) into
 *      readiness-app.js  ->  AI_PROXY_URL  and set  AI_ENABLED = true.
 *
 * See backend/README.md for the full walkthrough.
 */

const ALLOWED_ORIGINS = [
  'https://ballkingdom.com',
  'https://www.ballkingdom.com',
  'https://theballerskingdom.com'
];

const MODEL = 'claude-3-5-haiku-latest'; // fast + inexpensive; swap if you like
const MAX_TOKENS = 700;

// Simple in-memory rate limit (per Worker isolate). For stronger limits,
// back this with Cloudflare KV or Durable Objects.
const RATE = new Map();
const RATE_LIMIT = 8;          // requests
const RATE_WINDOW_MS = 60_000; // per minute per IP

const SYSTEM_PROMPT = `You are a business-readiness analyst for The Ballers Kingdom, the practice of Brian Kennedy Jr, M.Ed (Entrepreneur Ecosystem Executive Director at AmPac Business Capital).

You are given a small-business owner's self-assessment scores across three domains: Capital Readiness, Contract/Procurement Readiness, and Continuity/Exit Readiness, plus optional notes about their goal.

Write a concise, encouraging, specific analysis (250-350 words) that:
- Names their strongest area and biggest gap.
- Gives concrete next moves for the weakest domain.
- Where relevant, explains SBA 504 (buildings, facilities, major equipment) vs SBA 7(a) (acquisition, working capital, change of ownership), and that eligible borrowers may combine them up to roughly $10M. Frame as possibilities, not promises.
- Ends with one clear recommended next step (often: book a strategy session).

HARD RULES:
- This is EDUCATIONAL information, NOT financial, legal, tax, or investment advice.
- NEVER promise approval, rates, amounts, or outcomes. Use "may", "could", "eligible borrowers".
- No guarantees. No hype. Professional, warm, direct.
- Do not invent facts about the user beyond what the scores/notes provide.`;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = RATE.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + RATE_WINDOW_MS; }
  rec.count += 1;
  RATE.set(ip, rec);
  return rec.count > RATE_LIMIT;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Forbidden origin' }, 403, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Server not configured' }, 500, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) {
      return json({ error: 'Rate limit exceeded. Please try again shortly.' }, 429, cors);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400, cors); }

    // Build a compact, trusted user message from structured inputs only.
    const overall = clampInt(body.overall, 0, 100);
    const domains = sanitizeDomains(body.domains);
    const goal = String(body.goal || '').slice(0, 600);
    if (!domains.length) return json({ error: 'Missing domain scores' }, 400, cors);

    const userMsg =
      `Overall readiness: ${overall}/100\n` +
      domains.map(d => `${d.name}: ${d.pct}%`).join('\n') +
      (goal ? `\n\nOwner's stated goal: ${goal}` : '');

    try {
      const ai = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }]
        })
      });

      if (!ai.ok) {
        const detail = await ai.text();
        return json({ error: 'AI upstream error', status: ai.status, detail: detail.slice(0, 300) }, 502, cors);
      }
      const data = await ai.json();
      const text = (data.content && data.content[0] && data.content[0].text) || '';
      return json({ analysis: text }, 200, cors);
    } catch (e) {
      return json({ error: 'AI request failed' }, 502, cors);
    }
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}
function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return 0;
  return Math.max(min, Math.min(max, n));
}
function sanitizeDomains(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 6).map(d => ({
    name: String(d && d.name || '').slice(0, 60),
    pct: clampInt(d && d.pct, 0, 100)
  })).filter(d => d.name);
}

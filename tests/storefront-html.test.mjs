import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('products page contains the approved catalog entry points', async () => {
  const html = await read('products.html');
  for (const value of ['Digital Products & Personalized Solutions', 'data-product-grid', 'custom-solutions.html']) {
    assert.match(html, new RegExp(escapeRegExp(value)));
  }
});

test('storefront does not expose protected PDFs or pretend checkout is active', async () => {
  const html = await read('products.html');
  assert.doesNotMatch(html, /href=["'][^"']*\.pdf/i);
  assert.doesNotMatch(html, /quickbooks|intuit|payment successful|buy now/i);
});

test('storefront has one h1 and a main landmark', async () => {
  const html = await read('products.html');
  assert.equal((html.match(/<h1\b/gi) || []).length, 1);
  assert.match(html, /<main\b/i);
});

test('career page explains the complete value ladder', async () => {
  const html = await read('career-blueprint.html');
  for (const value of [
    'Career Opportunity Snapshot',
    'Personalized Career Opportunity Blueprint',
    'Career Strategy &amp; Network Navigation',
    'five business days',
    'not guaranteed'
  ]) assert.match(html, new RegExp(escapeRegExp(value), 'i'));
});

test('career intake remains fail closed until Phase 2', async () => {
  const html = await read('career-blueprint.html');
  assert.match(html, /data-career-intake-pending/);
  assert.match(html, /aria-disabled=["']true["']/);
  assert.doesNotMatch(html, /<input[^>]+type=["']file["']/i);
  assert.doesNotMatch(html, /quickbooks|intuit|\.pdf/i);
});

test('custom solutions page states scope and avoids promises', async () => {
  const html = await read('custom-solutions.html');
  assert.match(html, /customized guides, reports, and opportunity maps/i);
  assert.match(html, /scope, price, timeline, and feasibility/i);
  assert.match(html, /contact\.html\?interest=custom-solution/);
  assert.doesNotMatch(html, /guaranteed results|we can build anything/i);
});

test('primary pages expose the products destination', async () => {
  for (const page of ['index.html', 'shop.html', 'products.html', 'career-blueprint.html', 'custom-solutions.html']) {
    assert.match(await read(page), /href=["']products\.html["']/i, page);
  }
});

test('sitemap includes all public storefront routes', async () => {
  const xml = await read('sitemap.xml');
  for (const route of ['/products.html', '/career-blueprint.html', '/custom-solutions.html']) {
    assert.match(xml, new RegExp(escapeRegExp(route)));
  }
});

test('homepage introduces digital products without claiming checkout is live', async () => {
  const html = await read('index.html');
  assert.match(html, /Digital Products &amp; Personalized Solutions/);
  assert.match(html, /Build My Free Career Snapshot/);
  assert.doesNotMatch(html, /secure checkout is live|buy now/i);
});

test('light custom-solution bands force readable dark supporting text', async () => {
  const css = await read('assets/css/styles.css');
  assert.match(css, /\.custom-solutions-band p:not\(\.storefront-kicker\)\s*\{[^}]*color:\s*#171717/i);
});

test('Firebase Hosting excludes backend, tests, and local source material', async () => {
  const config = JSON.parse(await read('firebase.json'));
  const publicTarget = config.hosting.find((entry) => entry.target === 'public');
  assert.ok(publicTarget);
  for (const pattern of [
    'functions/**',
    'tests/**',
    'playwright.config.mjs',
    'firestore.indexes.json',
    'home-inspection-guide/input/**',
    'home-inspection-guide/audit/**'
  ]) assert.ok(publicTarget.ignore.includes(pattern), `missing Hosting ignore: ${pattern}`);
});

test('Firebase Hosting revalidates mutable CSS and JavaScript assets', async () => {
  const config = JSON.parse(await read('firebase.json'));
  const publicTarget = config.hosting.find((entry) => entry.target === 'public');
  const assetHeaders = publicTarget.headers.find((entry) => entry.source.includes('js|css'));
  const cacheControl = assetHeaders.headers.find((header) => header.key === 'Cache-Control');
  assert.equal(cacheControl.value, 'public, max-age=300, must-revalidate');
});

test('custom solution contact route preserves inquiry context', async () => {
  const html = await read('contact.html');
  assert.match(html, /id=["']custom-solution-inquiry["']/i);
  assert.match(html, /data-custom-solution-context/i);
  assert.match(html, /URLSearchParams/i);
  assert.match(html, /interest.*custom-solution/i);
});

test('protected delivery client uses an in-memory blob and never requests credential cookies', async () => {
  const client = await read('assets/js/commerce-client.js');
  assert.match(client, /Home Inspection Study Guide\.pdf/);
  assert.match(client, /URL\.createObjectURL/);
  assert.match(client, /URL\.revokeObjectURL/);
  assert.match(client, /getLimitedUseAppCheckToken/);
  assert.match(client, /AbortController/);
  assert.match(client, /\^\[A-Za-z0-9_-/);
  assert.match(client, /Object\.keys\(value\)\.length!==2/);
  assert.doesNotMatch(client, /credentials\s*:\s*["']include["']/);
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
});

test('public checkout presents a $49 QuickBooks invoice flow without payment credential fields or payment-method guarantees', async () => {
  const html = await read('order-status.html');
  assert.match(html, /\$49\.00/);
  assert.match(html, /QuickBooks invoice/i);
  assert.match(html, /card, Apple Pay, PayPal, or Venmo/i);
  assert.match(html, /eligible Apple device, eligible card, and Safari/i);
  assert.match(html, /electronic delivery/i);
  assert.match(html, /Refund and cancellation terms/i);
  assert.match(html, /href=["']terms\.html["']/i);
  assert.doesNotMatch(html, /payment method guaranteed|all payment methods/i);
  assert.doesNotMatch(html, /<input[^>]+(?:type=["']card|name=["'][^"']*(?:card|paypal|venmo))/i);
  assert.doesNotMatch(html, /approved identity|pilot/i);
});

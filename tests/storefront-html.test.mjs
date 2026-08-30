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

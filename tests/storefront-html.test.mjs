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

test('Firebase Hosting excludes every tracked root Markdown operations file', async () => {
  const config = JSON.parse(await read('firebase.json'));
  const publicTarget = config.hosting.find((entry) => entry.target === 'public');
  assert.ok(publicTarget.ignore.includes('*.md'));
  for (const name of ['HANDOFF_FIREBASE_MIGRATION.md','FORM_1ON1_REBUILD_SPEC.md','FORM_1ON1_LEGAL_STRUCTURE_V2.md','HOSTING.md']) {
    assert.match(name,/\.md$/);
    assert.ok(publicTarget.ignore.includes('*.md'),name);
  }
});

test('public checkout release keeps private and backend files off Hosting', async () => {
  const config = JSON.parse(await read('firebase.json'));
  const target = config.hosting.find((entry) => entry.target === 'public');
  assert.ok(target);
  for (const pattern of ['functions/**', 'tests/**', 'docs/**', 'firestore.rules', 'storage.rules']) {
    assert.ok(target.ignore.includes(pattern), `missing Hosting ignore: ${pattern}`);
  }
});

test('public checkout release inventories the exact reviewed Function surface', async () => {
  const source = await read('functions/src/index.js');
  const exportedFunctions = [...source.matchAll(/^export const\s+([A-Za-z0-9_]+)\s*=/gm)]
    .map((match) => match[1]);
  assert.deepEqual(exportedFunctions, [
    'requestPilotSignInLink',
    'createDigitalOrder',
    'getOrderStatus',
    'createDownloadGrant',
    'redeemDownloadGrant',
    'getBuyerCommerceCapability',
    'verifyOrderPayment',
    'getCommerceReleaseState',
    'getQuickBooksCommerceHealth',
    'requestRefundReview',
    'reconcileOrder',
    'reconcileRefund',
    'quickBooksCommerceWebhook',
    'reconcileCommerceOrders',
    'dispatchCommerceEffects',
    'confirmAcceptedBooking',
    'stageInvoiceApprovals',
    'approveInvoice',
    'beginQuickBooksConnection',
    'quickBooksOAuthCallback',
    'beginMicrosoftConnection',
    'microsoftOAuthCallback',
  ]);

  const release = await read('docs/operations/public-quickbooks-checkout-release.md');
  for (const name of exportedFunctions.filter((name) => name !== 'confirmAcceptedBooking')) {
    assert.match(release, new RegExp(`functions:${name}(?:,|\\s)`), name);
  }
  assert.doesNotMatch(release, /functions:confirmAcceptedBooking(?:,|\s)/);
});

test('public auth and ordering flags support inactive launch and customer-preserving disable', async () => {
  const env=await read('functions/.env.the-ballers-kingdom');
  assert.match(env,/^COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=false$/m);
  assert.match(env,/^COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false$/m);
  const release=await read('docs/operations/public-quickbooks-checkout-release.md');
  assert.match(release,/activate[^.]*AUTH_RESUME[^.]*DIGITAL_CHECKOUT/i);
  assert.match(release,/emergency[^.]*DIGITAL_CHECKOUT_ENABLED=false[^.]*AUTH_RESUME_ENABLED=true/is);
});

test('operative QuickBooks health documentation names the deployed redacted callable gate', async () => {
  const release=await read('docs/operations/public-quickbooks-checkout-release.md');
  assert.match(release,/getQuickBooksCommerceHealth/);
  assert.match(release,/admin[^.]*App Check/i);
  assert.match(release,/redacted[^.]*booleans/i);
  for (const path of [
    'docs/operations/quickbooks-commerce-runbook.md',
    'docs/operations/quickbooks-token-rotation-local-evidence.md',
  ]) {
    const text=await read(path);
    assert.doesNotMatch(text,/rotating_token_persistence_runtime_fix_unreviewed_undeployed/);
    assert.doesNotMatch(text,/implementation remains local\/unreviewed\/undeployed/i);
  }
});

test('public checkout release gates every customer effect on authoritative QuickBooks health', async () => {
  const release = await read('docs/operations/public-quickbooks-checkout-release.md');
  for (const value of [
    'published credential binding',
    'bounded refresh',
    'refresh continuity',
    'rotationPersisted=false',
    'CompanyInfo',
    "CompanyName='The Ballers Kingdom'",
    'before any authentication email, order, Customer, or Invoice',
  ]) assert.match(release, new RegExp(escapeRegExp(value), 'i'));
  assert.match(release,/exact refresh-token and realm versions pinned by the published (?:credential )?binding/i);
  assert.match(release,/post-refresh[^.]*binding[^.]*readback/i);
  assert.doesNotMatch(release,/highest enabled Secret Manager version/i);
});

test('public checkout rollback preserves paid-customer access and avoids full pre-feature redeploy', async () => {
  const release = await read('docs/operations/public-quickbooks-checkout-release.md');
  assert.match(release, /customer-preserving selective rollback/i);
  for (const name of ['requestPilotSignInLink', 'getOrderStatus', 'createDownloadGrant', 'redeemDownloadGrant']) {
    assert.match(release, new RegExp(`retain[^.]*${name}|${name}[^.]*retain`, 'i'), name);
  }
  assert.doesNotMatch(release, /git worktree add --detach/);
});

test('release packet and operator runbook share the three-flag customer-preserving rollback', async () => {
  for (const path of [
    'docs/operations/public-quickbooks-checkout-release.md',
    'docs/operations/quickbooks-commerce-runbook.md',
  ]) {
    const text=await read(path);
    assert.match(text,/COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false/);
    assert.match(text,/COMMERCE_PUBLIC_AUTH_RESUME_ENABLED=true/);
    assert.match(text,/COMMERCE_SERVICE_QBO_SEND_ENABLED=false/);
    for (const name of ['requestPilotSignInLink','getOrderStatus','createDownloadGrant','redeemDownloadGrant']) {
      assert.match(text,new RegExp(`retain[^.]*${name}|${name}[^.]*retain`,'i'),`${path}: ${name}`);
    }
  }
});

test('health documentation distinguishes unchanged continuity from persisted rotation', async () => {
  for (const path of [
    'docs/operations/public-quickbooks-checkout-release.md',
    'docs/operations/quickbooks-commerce-capability-evidence.md',
    'docs/operations/quickbooks-commerce-runbook.md',
  ]) {
    const text=await read(path);
    assert.match(text,/refresh continuity/i,path);
    assert.match(text,/unchanged[^.]*rotationPersisted=false/is,path);
    assert.match(text,/replacement[^.]*exact[^.]*persist/is,path);
  }
});

test('Apple Pay release evidence cites Intuit and requires controlled invoice visibility', async () => {
  const evidence = await read('docs/operations/quickbooks-commerce-capability-evidence.md');
  for (const path of [
    'frequently-asked-questions-apple-pay-quickbooks/L1yOQUp7l_US_en_US',
    'add-surcharge-customer-invoice-payments-quickbooks/L6Sg9UWf9_US_en_US',
  ]) assert.match(evidence, new RegExp(escapeRegExp(path)));
  assert.match(evidence, /controlled owner invoice[^.]*Apple Pay/i);
  assert.match(evidence, /representative[^.]*not global proof/i);
});

test('operative public capability evidence contains no retired pilot-only release controls', async () => {
  const evidence = await read('docs/operations/quickbooks-commerce-capability-evidence.md');
  for (const retired of [
    'COMMERCE_PILOT_RECIPIENT_EMAIL',
    'COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED',
    'rotating_token_persistence_runtime_fix_unreviewed_undeployed',
    'artifact absent',
  ]) assert.doesNotMatch(evidence, new RegExp(escapeRegExp(retired), 'i'), retired);
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

test('public checkout binds product, price, invoice, delivery, and payment-method copy to server capability', async () => {
  const html = await read('order-status.html');
  for (const binding of ['data-product-name','data-price','data-invoice-provider','data-delivery','data-payment-methods','data-apple-pay-label']) {
    assert.match(html, new RegExp(binding));
  }
  assert.match(html, /eligible Apple device, eligible card, and Safari/i);
  assert.match(html, /Refund and cancellation terms/i);
  assert.match(html, /href=["']terms\.html["']/i);
  assert.doesNotMatch(html, /\$49\.00|card, Apple Pay, PayPal, or Venmo/);
  assert.doesNotMatch(html, /payment method guaranteed|all payment methods/i);
  assert.doesNotMatch(html, /<input[^>]+(?:type=["']card|name=["'][^"']*(?:card|paypal|venmo))/i);
  assert.doesNotMatch(html, /approved identity|pilot/i);
});

test('digital-product terms state delivery, cancellation, refund review, access, and support boundaries', async () => {
  const html = await read('terms.html');
  for (const value of [
    'Digital Products',
    'QuickBooks invoice',
    'protected electronic delivery',
    'Cancellation requests received before payment is verified',
    'Refund requests are reviewed case by case',
    'access has already been used or downloaded',
    'info@ballkingdom.com',
  ]) assert.match(html, new RegExp(escapeRegExp(value), 'i'));
  assert.match(html, /do not promise automatic refunds/i);
  assert.doesNotMatch(html, /guaranteed refund/i);
});

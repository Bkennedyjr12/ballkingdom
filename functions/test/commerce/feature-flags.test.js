import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED,
  COMMERCE_SERVICE_QBO_SEND_ENABLED,
  readCommerceFeatureFlags,
} from '../../src/commerce/feature-flags.js';

const functionsUrl = new URL('../../', import.meta.url);

test('both commerce feature parameters default to Boolean false in code', () => {
  assert.deepEqual(readCommerceFeatureFlags(), {
    publicDigitalCheckoutEnabled: false,
    serviceQboSendEnabled: false,
  });
  assert.equal(COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED.value(), false);
  assert.equal(COMMERCE_SERVICE_QBO_SEND_ENABLED.value(), false);
});

test('public digital checkout flag defaults false independently', () => {
  const flags = readCommerceFeatureFlags({
    publicDigitalCheckoutParam: {value: () => false},
    serviceQboSendParam: {value: () => false},
  });
  assert.deepEqual(flags, {
    publicDigitalCheckoutEnabled: false,
    serviceQboSendEnabled: false,
  });
});

test('does not treat non-Boolean parameter values as enabled', () => {
  assert.deepEqual(readCommerceFeatureFlags({
    publicDigitalCheckoutParam: {value: () => 'false'},
    serviceQboSendParam: {value: () => 'true'},
  }), {
    publicDigitalCheckoutEnabled: false,
    serviceQboSendEnabled: false,
  });
});

test('committed project parameter file pins only reviewed flags and OAuth callback URLs', async () => {
  const source = await readFile(new URL('.env.the-ballers-kingdom', functionsUrl), 'utf8');
  const entries = source.trimEnd().split('\n');
  assert.equal(entries.length, 4);
  assert.equal(entries[0], 'COMMERCE_PUBLIC_DIGITAL_CHECKOUT_ENABLED=false');
  assert.equal(entries[1], 'COMMERCE_SERVICE_QBO_SEND_ENABLED=false');
  assert.equal(entries[2], 'QBO_REDIRECT_URI=https://us-west1-the-ballers-kingdom.cloudfunctions.net/quickBooksOAuthCallback');
  assert.equal(entries[3], 'MS_REDIRECT_URI=https://us-west1-the-ballers-kingdom.cloudfunctions.net/microsoftOAuthCallback');
  assert.doesNotMatch(source, /EMAIL|RECIPIENT|SECRET|TOKEN|CUSTOMER/i);

  const ignored = spawnSync('git', ['check-ignore', '-q', 'functions/.env.the-ballers-kingdom'], {
    cwd: new URL('../', functionsUrl),
  });
  assert.equal(ignored.status, 1);
  const ignoreSource = await readFile(new URL('.gitignore', functionsUrl), 'utf8');
  assert.match(ignoreSource, /^!\.env\.the-ballers-kingdom$/m);
});

test('Firebase wiring keeps the integration codebase path and secret boundaries fail closed', async () => {
  const rootUrl = new URL('../', functionsUrl);
  const indexSource = await readFile(new URL('src/index.js', functionsUrl), 'utf8');
  const firebase = JSON.parse(await readFile(new URL('firebase.json', rootUrl), 'utf8'));

  assert.equal(firebase.functions.source, 'functions');
  assert.equal(firebase.functions.codebase, 'ballkingdom-integrations');
  assert.match(indexSource, /defineSecret\('COMMERCE_PILOT_RECIPIENT_EMAIL'\)/);
  assert.match(indexSource, /const COMMERCE_QBO_WEBHOOK_ENABLED = false;/);
  assert.doesNotMatch(indexSource, /defineSecret\('QBO_WEBHOOK_VERIFIER_TOKEN'\)/);
  assert.match(indexSource, /export const quickBooksCommerceWebhook = onRequest\(\{\s*region:REGION\s*\}/s);
  assert.match(indexSource, /export const requestPilotSignInLink = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const createDigitalOrder = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const getOrderStatus = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const getBuyerCommerceCapability = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const getCommerceReleaseState = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const reconcileCommerceOrders = onSchedule\(\{schedule:'every 5 minutes',[\s\S]*?secrets:QBO_RUNTIME_SECRETS,[\s\S]*?runtimeCommerceService\(\{withQuickBooks:true\}\)/);
  assert.match(indexSource, /export const dispatchCommerceEffects = onSchedule\(\{schedule:'every 4 minutes',[\s\S]*?secrets:\[COMMERCE_PILOT_RECIPIENT_EMAIL,\.\.\.QBO_RUNTIME_SECRETS,\.\.\.MS_SECRETS\],[\s\S]*?dispatchPendingEffects/);
  assert.doesNotMatch(indexSource, /defineSecret\(['"]QBO_(?:REFRESH_TOKEN|REALM_ID)/);
  const serviceSource = await readFile(new URL('src/commerce/commerce-service.js', functionsUrl), 'utf8');
  assert.match(serviceSource, /timingSafeEqual\(/);
  assert.match(serviceSource, /compare\\0/);
  assert.match(serviceSource, /binding\\0/);
  assert.doesNotMatch(JSON.stringify(firebase), /COMMERCE_PILOT_RECIPIENT_EMAIL|QBO_WEBHOOK_VERIFIER_TOKEN/);
  assert.doesNotMatch(indexSource, /approved-pilot@example\.test/i);
  assert.match(indexSource, /quickbooks:withQuickBooks \? lazyQuickBooksClient\(\) : null/);
  assert.match(indexSource, /graph:withGraph \? lazyGraphClient\(\) : null/);
});

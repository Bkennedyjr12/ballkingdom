import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED,
  COMMERCE_SERVICE_QBO_SEND_ENABLED,
  readCommerceFeatureFlags,
} from '../../src/commerce/feature-flags.js';

const functionsUrl = new URL('../../', import.meta.url);

test('both commerce feature parameters default to Boolean false in code', () => {
  assert.deepEqual(readCommerceFeatureFlags(), {
    digitalInvoicePilotEnabled: false,
    serviceQboSendEnabled: false,
  });
  assert.equal(COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED.value(), false);
  assert.equal(COMMERCE_SERVICE_QBO_SEND_ENABLED.value(), false);
});

test('rejects non-Boolean parameter values instead of treating strings as truthy', () => {
  assert.throws(() => readCommerceFeatureFlags({
    digitalInvoicePilotParam: {value: () => 'false'},
    serviceQboSendParam: {value: () => false},
  }), /Boolean/);
});

test('committed project parameter file has only the two allowlisted Boolean keys', async () => {
  const source = await readFile(new URL('.env.the-ballers-kingdom', functionsUrl), 'utf8');
  const entries = source.trimEnd().split('\n');
  assert.equal(entries.length, 2);
  assert.match(entries[0], /^COMMERCE_DIGITAL_INVOICE_PILOT_ENABLED=(?:true|false)$/);
  assert.equal(entries[1], 'COMMERCE_SERVICE_QBO_SEND_ENABLED=false');
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
  assert.match(indexSource, /export const requestPilotSignInLink = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const createDigitalOrder = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const getOrderStatus = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const getCommerceReleaseState = onCall\(\{[^}]*enforceAppCheck:true/s);
  assert.match(indexSource, /export const reconcileCommerceOrders = onSchedule\(\{schedule:'every 5 minutes',[\s\S]*?secrets:QBO_SECRETS,[\s\S]*?runtimeCommerceService\(\{withQuickBooks:true\}\)/);
  assert.match(indexSource, /export const dispatchCommerceEffects = onSchedule\(\{schedule:'every 5 minutes',[\s\S]*?secrets:\[COMMERCE_PILOT_RECIPIENT_EMAIL,\.\.\.QBO_SECRETS,\.\.\.MS_SECRETS\],[\s\S]*?dispatchPendingEffects/);
  const serviceSource = await readFile(new URL('src/commerce/commerce-service.js', functionsUrl), 'utf8');
  assert.match(serviceSource, /timingSafeEqual\(/);
  assert.match(serviceSource, /compare\\0/);
  assert.match(serviceSource, /binding\\0/);
  assert.doesNotMatch(JSON.stringify(firebase), /COMMERCE_PILOT_RECIPIENT_EMAIL|QBO_WEBHOOK_VERIFIER_TOKEN/);
  assert.doesNotMatch(indexSource, /approved-pilot@example\.test/i);
  assert.match(indexSource, /quickbooks:withQuickBooks \? lazyQuickBooksClient\(\) : null/);
  assert.match(indexSource, /graph:withGraph \? lazyGraphClient\(\) : null/);
});

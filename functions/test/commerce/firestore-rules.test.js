import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const rootUrl = new URL('../../../', import.meta.url);
const COMMERCE_COLLECTIONS = [
  'orders',
  'commerceAudit',
  'commerceEffects',
  'commerceReservations',
  'commerceWebhookHints',
  'commerceRateLimits',
  'fulfillmentGrants',
];

test('commerce rules explicitly deny every direct client operation without an admin bypass', async () => {
  const rules = await readFile(new URL('firestore.rules', rootUrl), 'utf8');

  assert.doesNotMatch(rules, /request\.auth|\.token\.admin|allow\s+[^:]+:\s*if\s+true/);
  for (const collectionName of COMMERCE_COLLECTIONS) {
    assert.match(rules, new RegExp(
      `match /${collectionName}/\\{document=\\*\\*\\} \\{\\s*allow read, write: if false;\\s*\\}`
    ));
  }
});

test('the standalone commerce rules artifact is not configured as the deployable production ruleset', async () => {
  const config = JSON.parse(await readFile(new URL('firebase.json', rootUrl), 'utf8'));

  assert.equal(config.firestore?.rules, undefined);
  assert.equal(config.hosting[0].ignore.includes('firestore.rules'), true);
});

test('the index manifest supports bounded due-order reconciliation queries', async () => {
  const manifest = JSON.parse(await readFile(new URL('firestore.indexes.json', rootUrl), 'utf8'));
  const matchingIndexes = manifest.indexes.filter(index => index.collectionGroup === 'orders');

  assert.deepEqual(matchingIndexes, [{
    collectionGroup: 'orders',
    queryScope: 'COLLECTION',
    fields: [
      {fieldPath: 'terminal', order: 'ASCENDING'},
      {fieldPath: 'reconciliationDueAt', order: 'ASCENDING'},
    ],
  }]);
});

test('the index manifest supports the bounded due-effect dispatcher', async () => {
  const manifest = JSON.parse(await readFile(new URL('firestore.indexes.json', rootUrl), 'utf8'));
  const matchingIndexes = manifest.indexes.filter(index => index.collectionGroup === 'commerceEffects');

  assert.deepEqual(matchingIndexes, [{
    collectionGroup:'commerceEffects',
    queryScope:'COLLECTION',
    fields:[
      {fieldPath:'status',order:'ASCENDING'},
      {fieldPath:'nextAttemptAt',order:'ASCENDING'},
    ],
  }]);
});

test('emulator auth-context coverage requires the Firebase Rules test SDK and a Java runtime', {
  skip: 'Environment gate: no @firebase/rules-unit-testing dependency or Java runtime is available in this branch.',
}, () => {});

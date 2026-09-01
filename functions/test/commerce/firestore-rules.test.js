import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, doc, getDoc, getDocs, setDoc} from 'firebase/firestore';

const rootUrl = new URL('../../../', import.meta.url);
const COMMERCE_COLLECTIONS = [
  'orders',
  'commerceAudit',
  'commerceEffects',
  'commerceReservations',
  'commerceWebhookHints',
  'commerceRateLimits',
  'commercePublicAuthLimits',
  'fulfillmentGrants',
];

test('mapped Firestore rules explicitly deny commerce operations without an admin bypass', async () => {
  const rules = await readFile(new URL('firestore.rules', rootUrl), 'utf8');
  const commerceBlock = rules.match(
    /\/\/ BEGIN LOCAL COMMERCE MERGE CANDIDATE([\s\S]*?)\/\/ END LOCAL COMMERCE MERGE CANDIDATE/
  )?.[1];

  assert.ok(commerceBlock);
  assert.doesNotMatch(commerceBlock, /request\.auth|\.token\.admin|allow\s+[^:]+:\s*if\s+true/);
  for (const collectionName of COMMERCE_COLLECTIONS) {
    assert.match(commerceBlock, new RegExp(
      `match /${collectionName}/\\{document=\\*\\*\\} \\{\\s*allow read, write: if false;\\s*\\}`
    ));
  }
});

test('the reviewed Firestore candidate is byte-exactly mapped at the repository root', async () => {
  const config = JSON.parse(await readFile(new URL('firebase.json', rootUrl), 'utf8'));
  const rootRules = await readFile(new URL('firestore.rules', rootUrl));
  const candidateRules = await readFile(new URL(
    'docs/operations/evidence/firebase-rules/merge-candidates/firestore.rules', rootUrl
  ));

  assert.equal(config.firestore?.rules, 'firestore.rules');
  assert.equal(config.firestore?.indexes, 'firestore.indexes.json');
  assert.deepEqual(rootRules, candidateRules);
  for (const hosting of config.hosting) {
    assert.equal(hosting.ignore.includes('firestore.rules'), true);
  }
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

  assert.deepEqual(matchingIndexes, [
    {
      collectionGroup:'commerceEffects',
      queryScope:'COLLECTION',
      fields:[
        {fieldPath:'status',order:'ASCENDING'},
        {fieldPath:'nextAttemptAt',order:'ASCENDING'},
      ],
    },
    {
      collectionGroup:'commerceEffects',
      queryScope:'COLLECTION',
      fields:[
        {fieldPath:'publicAuth',order:'ASCENDING'},
        {fieldPath:'cleanupEligible',order:'ASCENDING'},
        {fieldPath:'retentionExpiresAt',order:'ASCENDING'},
      ],
    },
  ]);
});

test('the index manifest exactly covers every public-auth cleanup query', async () => {
  const manifest = JSON.parse(await readFile(new URL('firestore.indexes.json', rootUrl), 'utf8'));
  const source = await readFile(new URL('../../src/commerce/order-repository.js', import.meta.url), 'utf8');
  const fieldsFor = collectionGroup => manifest.indexes
    .filter(index => index.collectionGroup === collectionGroup)
    .map(index => index.fields.map(field => field.fieldPath).join(','));

  assert.match(source,/publicAuth'.*?cleanupEligible'.*?retentionExpiresAt/s);
  assert.match(source,/publicAuth'.*?expiresAt/s);
  assert.deepEqual(fieldsFor('commercePublicAuthLimits'), ['publicAuth,expiresAt']);
  assert.deepEqual(fieldsFor('commerceAudit'), ['publicAuth,cleanupEligible,retentionExpiresAt']);
  assert.equal(fieldsFor('commerceEffects').includes('publicAuth,cleanupEligible,retentionExpiresAt'), true);
});

test('mapped root Firestore rules deny commerce clients while preserving retained owner reads', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST && 'Firestore emulator is required',
}, async () => {
  const rules = await readFile(new URL('firestore.rules',rootUrl), 'utf8');
  const environment = await initializeTestEnvironment({
    projectId:`demo-ballkingdom-commerce-firestore-${process.pid}`,
    firestore:{rules},
  });
  try {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async context => {
      const database = context.firestore();
      await setDoc(doc(database,'owners/owner-1/clients/client-1'), {name:'Retained policy'});
      for (const name of [...COMMERCE_COLLECTIONS,'commerceRefundReviews','commerceRefundReviewTotals']) {
        await setDoc(doc(database,name,'seed'), {private:true});
      }
    });
    const contexts = [
      environment.unauthenticatedContext(),
      environment.authenticatedContext('ordinary'),
      environment.authenticatedContext('owner-1',{companionOwner:true}),
      environment.authenticatedContext('owner-2',{companionOwner:true}),
      environment.authenticatedContext('admin',{admin:true}),
    ];
    const collections = [...COMMERCE_COLLECTIONS,'commerceRefundReviews','commerceRefundReviewTotals'];
    for (const context of contexts) {
      const database = context.firestore();
      for (const name of collections) {
        await assertFails(getDoc(doc(database,name,'seed')));
        await assertFails(getDocs(collection(database,name)));
        await assertFails(setDoc(doc(database,name,'client-write'), {unsafe:true}));
      }
    }
    await assertSucceeds(getDoc(doc(
      environment.authenticatedContext('owner-1',{companionOwner:true}).firestore(),
      'owners/owner-1/clients/client-1',
    )));
    for (const context of [
      environment.unauthenticatedContext(),environment.authenticatedContext('ordinary'),
      environment.authenticatedContext('owner-2',{companionOwner:true}),
      environment.authenticatedContext('admin',{admin:true}),
    ]) {
      await assertFails(getDoc(doc(context.firestore(),'owners/owner-1/clients/client-1')));
    }
    await assertFails(setDoc(doc(
      environment.authenticatedContext('owner-1',{companionOwner:true}).firestore(),
      'owners/owner-1/clients/client-1',
    ), {name:'No client writes'}));
  } finally {
    await environment.clearFirestore();
    await environment.cleanup();
  }
});

test('Firestore merge candidate preserves every original byte outside narrow commerce denies', async () => {
  const original = await readFile(new URL(
    'docs/operations/evidence/firebase-rules/firestore/2c9d612b-dd17-406f-9a0f-86230c57420c/firestore.rules',rootUrl
  ), 'utf8');
  const candidate = await readFile(new URL(
    'docs/operations/evidence/firebase-rules/merge-candidates/firestore.rules',rootUrl
  ), 'utf8');
  const stripped = candidate.replace(
    /    \/\/ BEGIN LOCAL COMMERCE MERGE CANDIDATE\n[\s\S]*?    \/\/ END LOCAL COMMERCE MERGE CANDIDATE\n\n/,
    '',
  );
  assert.equal(stripped, original);
  for (const collection of [...COMMERCE_COLLECTIONS,'commerceRefundReviews','commerceRefundReviewTotals']) {
    assert.match(candidate, new RegExp(`match /${collection}/\\{document=\\*\\*\\}`));
  }
});

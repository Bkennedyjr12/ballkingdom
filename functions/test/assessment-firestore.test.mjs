import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { createAssessmentRepository } from '../src/assessment/firestore-repository.js';
import { createAssessmentService } from '../src/assessment/service.js';

const active = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8185';
test('assessment transaction, owner isolation and unchanged client-denial rules', { skip: !active }, async t => {
  // Refuse any emulator alias, cloud project, credential or real member namespace.
  const projectId = 'demo-bk-assessment';
  const rulesPath = process.env.BK_ASSESSMENT_RULES_FILE;
  assert.equal(typeof rulesPath, 'string');
  const rules = await readFile(rulesPath, 'utf8');
  const environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules } });
  const packaged = process.env.BK_ASSESSMENT_PACKAGED_SDK === '1';
  const requirePackage = createRequire(new URL('../../functions-assessment/package.json', import.meta.url));
  const sdkApp = packaged ? requirePackage('firebase-admin/app') : { initializeApp, deleteApp };
  const sdkStore = packaged ? requirePackage('firebase-admin/firestore') : { getFirestore, FieldPath };
  const app = sdkApp.initializeApp({ projectId }, 'synthetic-assessment-emulator');
  const db = sdkStore.getFirestore(app), repository = createAssessmentRepository({ db, documentIdField: sdkStore.FieldPath.documentId() });
  let time = 1700000000000;
  const uid = 'synthetic-assessment-owner';
  const context = { synthetic: true }, service = createAssessmentService({ enabled: true, repository, now: () => time,
    authenticateRequest: async value => value === context ? { uid, appCheckValid: true } : null });
  const input = { schemaVersion: 'bk-ai-readiness-v1', answers: Array(12).fill(2), saveConsent: true, requestId: '11111111-1111-4111-8111-111111111111' };
  try {
    await environment.clearFirestore();
    let first;
    await t.test('concurrent lost-response retries commit exactly one answer record and count', async () => {
      const results = await Promise.all([service.save(input, context), service.save(input, context)]);
      first = results[0]; assert.deepEqual(results[0], results[1]);
      assert.equal((await db.collection('bkAssessmentAccounts').doc(uid).get()).data().recordsCount, 1);
      assert.equal((await db.collection('bkAssessmentAccounts').doc(uid).collection('runs').get()).size, 1);
      assert.equal(first.report.total, 24);
    });
    await t.test('server lookup and pagination cannot leave the verified owner namespace', async () => {
      const other = createAssessmentService({ enabled: true, repository, now: () => time, authenticateRequest: async () => ({ uid: 'synthetic-other-owner', appCheckValid: true }) });
      await assert.rejects(other.get({ assessmentId: first.assessmentId }, context), { code: 'ASSESSMENT_NOT_FOUND' });
      assert.deepEqual(await other.list({ cursor: null }, context), { items: [], nextCursor: null });
      await assert.rejects(other.list({ cursor: first.assessmentId }, context), { code: 'ASSESSMENT_INPUT_INVALID' });
      assert.equal((await service.list({ cursor: null }, context)).items.length, 1);
    });
    await t.test('live client rules deny even owner direct create/read/delete of assessment records', async () => {
      for (const client of [environment.unauthenticatedContext(), environment.authenticatedContext(uid), environment.authenticatedContext('synthetic-other-owner')]) {
        const reference = doc(client.firestore(), 'bkAssessmentAccounts/' + uid + '/runs/' + first.assessmentId);
        await assertFails(getDoc(reference)); await assertFails(setDoc(reference, { synthetic: true })); await assertFails(deleteDoc(reference));
      }
    });
    await t.test('confirmed deletion atomically removes answers and prevents stale save recreation', async () => {
      await service.remove({ assessmentId: first.assessmentId }, context);
      const account = db.collection('bkAssessmentAccounts').doc(uid);
      assert.equal((await account.collection('runs').doc(first.assessmentId).get()).exists, false);
      assert.deepEqual((await account.collection('deletedReceipts').doc(first.assessmentId).get()).data(), { deletedAtMs: time });
      assert.equal((await account.get()).data().recordsCount, 0);
      await assert.rejects(service.save(input, context), { code: 'ASSESSMENT_ALREADY_DELETED' });
    });
    await t.test('minute limit is transactional and resets without deleting retained answers', async () => {
      time += 60000;
      const outcomes = await Promise.all(Array.from({ length: 11 }, () => repository.consumeQuota('synthetic-rate-owner', 'save', time)));
      assert.equal(outcomes.filter(Boolean).length, 10);
      time += 60000;
      assert.equal(await repository.consumeQuota('synthetic-rate-owner', 'save', time), true);
    });
  } finally { await environment.clearFirestore(); await environment.cleanup(); await db.terminate(); await sdkApp.deleteApp(app); }
});

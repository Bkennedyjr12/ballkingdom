import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentService } from '../src/assessment/service.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const input = () => ({ schemaVersion: 'bk-ai-readiness-v1', answers: Array(12).fill(2), saveConsent: true, requestId });
const context = Object.freeze({ synthetic: true });

function fixture(overrides = {}) {
  const records = new Map(), deleted = new Set(), calls = [];
  const repository = {
    async consumeQuota(uid, action) { calls.push(['quota', uid, action]); return true; },
    async createForOwner(uid, id, record) {
      const key = `${uid}/${id}`;
      if (deleted.has(key)) return { status: 'deleted' };
      const prior = records.get(key);
      if (prior && JSON.stringify(prior.answers) !== JSON.stringify(record.answers)) return { status: 'conflict' };
      records.set(key, prior ?? structuredClone(record));
      return { status: 'saved', record: records.get(key) };
    },
    async getForOwner(uid, id) { calls.push(['get', uid, id]); return structuredClone(records.get(`${uid}/${id}`) ?? null); },
    async listForOwner(uid, { cursor, limit }) {
      calls.push(['list', uid, cursor]);
      const owned = [...records].filter(([key]) => key.startsWith(uid + '/')).map(([key, record]) => ({ assessmentId: key.slice(uid.length + 1), record }));
      const start = cursor ? owned.findIndex(item => item.assessmentId === cursor) + 1 : 0;
      if (cursor && !start) return { status: 'invalid-cursor' };
      return { status: 'ok', items: owned.slice(start, start + limit), nextCursor: start + limit < owned.length ? owned[start + limit - 1].assessmentId : null };
    },
    async deleteForOwner(uid, id) { calls.push(['delete', uid, id]); const key = `${uid}/${id}`; records.delete(key); deleted.add(key); },
    ...overrides,
  };
  return { records, calls, repository, service: createAssessmentService({ enabled: true, repository,
    authenticateRequest: async value => value === context ? { uid: 'synthetic-owner', appCheckValid: true } : null,
    now: () => 1700000000000 }) };
}

test('account saving requires an explicit versioned consent and a bounded retry identifier', async () => {
  const f = fixture();
  for (const value of [{ ...input(), saveConsent: false }, { ...input(), saveConsent: 'true' }, { ...input(), requestId: '../other' }, { schemaVersion: input().schemaVersion, answers: input().answers }]) {
    await assert.rejects(f.service.save(value, context), { code: 'ASSESSMENT_INPUT_INVALID' });
  }
  assert.equal(f.records.size, 0);
});

test('a lost response retry returns the same saved result without creating a duplicate', async () => {
  const f = fixture();
  const first = await f.service.save(input(), context), retry = await f.service.save(input(), context);
  assert.deepEqual(retry, first);
  assert.equal(f.records.size, 1);
  assert.equal(first.report.total, 24);
  const record = [...f.records.values()][0];
  assert.equal(record.saveConsentVersion, 'member-opt-in-until-delete-v1');
  assert.ok(!Object.hasOwn(record, 'expiresAt'));
  await assert.rejects(f.service.save({ ...input(), answers: Array(12).fill(3) }, context), { code: 'ASSESSMENT_RETRY_CONFLICT' });
});

test('member deletion removes the answer record and a stale retry cannot recreate it', async () => {
  const f = fixture(), result = await f.service.save(input(), context);
  assert.deepEqual(await f.service.remove({ assessmentId: result.assessmentId }, context), { deleted: true });
  assert.equal(f.records.size, 0);
  await assert.rejects(f.service.get({ assessmentId: result.assessmentId }, context), { code: 'ASSESSMENT_NOT_FOUND' });
  await assert.rejects(f.service.save(input(), context), { code: 'ASSESSMENT_ALREADY_DELETED' });
  assert.deepEqual(await f.service.remove({ assessmentId: result.assessmentId }, context), { deleted: true });
});

test('listing stays in the verified owner namespace and returns bounded recomputed reports', async () => {
  const f = fixture();
  await f.service.save(input(), context);
  f.records.set('other-owner/other-assessment', { ownerUid: 'other-owner', schemaVersion: 'bk-ai-readiness-v1', answers: Array(12).fill(3), createdAtMs: 1700000000000, saveConsentVersion: 'member-opt-in-until-delete-v1' });
  const result = await f.service.list({ cursor: null }, context);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].report.total, 24);
  assert.ok(!Object.hasOwn(result.items[0], 'ownerUid'));
  assert.ok(!Object.hasOwn(result.items[0], 'answers'));
  assert.equal(result.nextCursor, null);
  await assert.rejects(f.service.list({ cursor: '../other-owner' }, context), { code: 'ASSESSMENT_INPUT_INVALID' });
  await assert.rejects(f.service.list({ cursor: null, uid: 'other-owner' }, context), { code: 'ASSESSMENT_INPUT_INVALID' });
  await assert.rejects(f.service.list({ cursor: 'unknown-id' }, context), { code: 'ASSESSMENT_INPUT_INVALID' });
});

test('unsigned deletion and claimed ownership never reach the repository', async () => {
  const f = fixture();
  await assert.rejects(f.service.remove({ assessmentId: 'synthetic-id' }, { uid: 'synthetic-owner' }), { code: 'ASSESSMENT_AUTH_REQUIRED' });
  await assert.rejects(f.service.remove({ assessmentId: 'synthetic-id', uid: 'other-owner' }, context), { code: 'ASSESSMENT_INPUT_INVALID' });
  await assert.rejects(f.service.list({ cursor: null }, null), { code: 'ASSESSMENT_AUTH_REQUIRED' });
  assert.ok(f.calls.every(call => call[0] === 'quota'));
});

test('quota and capacity fail closed without storing assessment answers', async () => {
  const quota = fixture({ consumeQuota: async () => false });
  await assert.rejects(quota.service.save(input(), context), { code: 'ASSESSMENT_RATE_LIMITED' });
  assert.equal(quota.records.size, 0);
  const full = fixture({ createForOwner: async () => ({ status: 'capacity' }) });
  await assert.rejects(full.service.save(input(), context), { code: 'ASSESSMENT_CAPACITY' });
});

test('database load, list, delete and limiter failures expose no provider text', async () => {
  const message = 'synthetic-private-database-detail';
  for (const [method, action, argument, code] of [
    ['getForOwner', 'get', { assessmentId: 'synthetic-id' }, 'ASSESSMENT_LOAD_FAILED'],
    ['listForOwner', 'list', { cursor: null }, 'ASSESSMENT_LOAD_FAILED'],
    ['deleteForOwner', 'remove', { assessmentId: 'synthetic-id' }, 'ASSESSMENT_DELETE_FAILED'],
    ['consumeQuota', 'list', { cursor: null }, 'ASSESSMENT_RATE_LIMITED'],
  ]) {
    const f = fixture({ [method]: async () => { throw Object.assign(new Error(message), { code: 'ASSESSMENT_NOT_FOUND' }); } });
    await assert.rejects(f.service[action](argument, context), error => error.code === code && !error.message.includes(message));
  }
});

test('corrupt saved data is withheld from both individual and list responses', async () => {
  const f = fixture(), saved = await f.service.save(input(), context);
  f.records.get('synthetic-owner/' + saved.assessmentId).answers[0] = 9;
  await assert.rejects(f.service.get({ assessmentId: saved.assessmentId }, context), { code: 'ASSESSMENT_NOT_FOUND' });
  await assert.rejects(f.service.list({ cursor: null }, context), { code: 'ASSESSMENT_LOAD_FAILED' });
});

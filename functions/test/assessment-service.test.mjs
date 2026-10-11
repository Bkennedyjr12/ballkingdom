import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../src/assessment/service.js').catch(() => ({}));
const input = () => ({ schemaVersion: 'bk-ai-readiness-v1', answers: Array(12).fill(2), saveConsent: true, requestId: '11111111-1111-4111-8111-111111111111' });
const trusted = Object.freeze({ fixture: 'verified-synthetic-user' });

function fixture(options = {}) {
  const records = new Map();
  let writes = 0;
  let reads = 0;
  const repository = {
    async consumeQuota() { return true; },
    async listForOwner() { return { status: 'ok', items: [], nextCursor: null }; },
    async deleteForOwner() {},
    async createForOwner(uid, id, record) {
      writes += 1;
      records.set(`${uid}/${id}`, structuredClone(record));
      return { status: 'saved', record: structuredClone(record) };
    },
    async getForOwner(uid, id) {
      reads += 1;
      return structuredClone(records.get(`${uid}/${id}`) ?? null);
    },
  };
  const service = module.createAssessmentService({
    repository,
    authenticateRequest: async context => context === trusted ? { uid: 'synthetic-owner', appCheckValid: true } : null,
    now: () => 1700000000000,
    makeId: () => 'synthetic-assessment-1',
    ...options,
  });
  return { service, records, repository, writes: () => writes, reads: () => reads };
}

test('persistence defaults disabled without calling auth or the repository', async () => {
  assert.equal(typeof module.createAssessmentService, 'function', 'server assessment service is implemented');
  const f = fixture({ authenticateRequest: () => assert.fail('disabled service called auth') });
  await assert.rejects(f.service.save(input(), trusted), { code: 'ASSESSMENT_DISABLED' });
  await assert.rejects(f.service.get({ assessmentId: 'synthetic-assessment-1' }, trusted), { code: 'ASSESSMENT_DISABLED' });
  assert.equal(f.writes(), 0);
  assert.equal(f.reads(), 0);
});

test('saved assessment ownership comes only from verified identity and scores are recomputed', async () => {
  assert.equal(typeof module.createAssessmentService, 'function');
  const f = fixture({ enabled: true });
  const result = await f.service.save(input(), trusted);
  assert.equal(result.assessmentId, 'synthetic-assessment-1');
  assert.equal(result.report.total, 24);
  assert.deepEqual(f.records.get('synthetic-owner/synthetic-assessment-1'), {
    ownerUid: 'synthetic-owner', schemaVersion: 'bk-ai-readiness-v1', answers: Array(12).fill(2), createdAtMs: 1700000000000, saveConsentVersion: 'member-opt-in-until-delete-v1',
  });
  const loaded = await f.service.get({ assessmentId: 'synthetic-assessment-1' }, trusted);
  assert.equal(loaded.report.total, 24);
});

test('claimed identity, commercial values and entitlement or progress fields are rejected', async () => {
  assert.equal(typeof module.createAssessmentService, 'function');
  const f = fixture({ enabled: true });
  for (const extra of [{ uid: 'another-user' }, { ownerUid: 'another-user' }, { price: 0 }, { amountCents: 1 }, { progress: 100 }, { entitlement: true }, { paid: true }, { email: 'synthetic@example.invalid' }, { score: 36 }]) {
    await assert.rejects(f.service.save({ ...input(), ...extra }, trusted), { code: 'ASSESSMENT_INPUT_INVALID' });
  }
  assert.equal(f.writes(), 0);
});

test('missing identity, invalid UID and missing App Check cannot read or write', async () => {
  assert.equal(typeof module.createAssessmentService, 'function');
  const unsigned = fixture({ enabled: true });
  await assert.rejects(unsigned.service.save(input(), { uid: 'synthetic-owner' }), { code: 'ASSESSMENT_AUTH_REQUIRED' });
  await assert.rejects(unsigned.service.get({ assessmentId: 'synthetic-assessment-1' }, null), { code: 'ASSESSMENT_AUTH_REQUIRED' });
  assert.equal(unsigned.writes(), 0);
  assert.equal(unsigned.reads(), 0);
  for (const identity of [{ uid: '../synthetic-owner', appCheckValid: true }, { uid: '', appCheckValid: true }, { uid: 'synthetic-owner', appCheckValid: false }]) {
    const f = fixture({ enabled: true, authenticateRequest: async () => identity });
    await assert.rejects(f.service.save(input(), trusted), { code: 'ASSESSMENT_AUTH_REQUIRED' });
    assert.equal(f.writes(), 0);
  }
});

test('server rejects incomplete, out-of-range and incompatible assessment schemas', async () => {
  assert.equal(typeof module.createAssessmentService, 'function');
  const f = fixture({ enabled: true });
  for (const value of [{ ...input(), schemaVersion: 'other' }, { ...input(), answers: Array(11).fill(0) }, { ...input(), answers: Array(12).fill(null) }, { ...input(), answers: Array(12).fill('3') }, { ...input(), answers: Array(12).fill(4) }, { ...input(), answers: Array(12) }]) {
    await assert.rejects(f.service.save(value, trusted), { code: 'ASSESSMENT_INPUT_INVALID' });
  }
  assert.equal(f.writes(), 0);
});

test('owner-scoped lookup cannot retrieve another account assessment or leak its existence', async () => {
  assert.equal(typeof module.createAssessmentService, 'function');
  const f = fixture({ enabled: true });
  f.records.set('another-owner/synthetic-assessment-1', { ownerUid: 'another-owner', ...input(), createdAtMs: 1700000000000 });
  await assert.rejects(f.service.get({ assessmentId: 'synthetic-assessment-1' }, trusted), { code: 'ASSESSMENT_NOT_FOUND' });
  f.records.set('synthetic-owner/synthetic-assessment-1', { ownerUid: 'another-owner', ...input(), createdAtMs: 1700000000000 });
  await assert.rejects(f.service.get({ assessmentId: 'synthetic-assessment-1' }, trusted), { code: 'ASSESSMENT_NOT_FOUND' });
  await assert.rejects(f.service.get({ assessmentId: '../another-owner' }, trusted), { code: 'ASSESSMENT_INPUT_INVALID' });
  await assert.rejects(f.service.get({ assessmentId: 'synthetic-assessment-1', uid: 'another-owner' }, trusted), { code: 'ASSESSMENT_INPUT_INVALID' });
});

test('repository failures return bounded errors and never expose provider details', async () => {
  assert.equal(typeof module.createAssessmentService, 'function');
  const f = fixture({ enabled: true, repository: {
    async consumeQuota() { return true; },
    async listForOwner() { return { status: 'ok', items: [], nextCursor: null }; },
    async deleteForOwner() {},
    async createForOwner() { throw new Error('synthetic-private-provider-detail'); },
    async getForOwner() { throw new Error('synthetic-private-provider-detail'); },
  } });
  await assert.rejects(f.service.save(input(), trusted), error => error.code === 'ASSESSMENT_SAVE_FAILED' && !error.message.includes('provider-detail'));
  await assert.rejects(f.service.get({ assessmentId: 'synthetic-assessment-1' }, trusted), error => error.code === 'ASSESSMENT_LOAD_FAILED' && !error.message.includes('provider-detail'));
});

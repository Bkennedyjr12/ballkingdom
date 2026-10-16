import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentCallable, ASSESSMENT_WEB_APP_ID } from '../src/assessment/callable-handler.js';

class PublicError extends Error { constructor(code, message) { super(message); this.code = code; } }
const request = () => ({ data: { action: 'list', payload: { cursor: null } }, auth: { uid: 'synthetic-owner', token: { email_verified: true, auth_time: 1700000000 } },
  app: { appId: ASSESSMENT_WEB_APP_ID }, rawRequest: { get: key => key === 'origin' ? 'https://ballkingdom.com' : undefined } });
function fixture(user = { uid: 'synthetic-owner', disabled: false, emailVerified: true, tokensValidAfterTime: '2023-11-14T22:13:19Z' }) {
  let accesses = 0;
  const handler = createAssessmentCallable({ enabled: true, ErrorClass: PublicError, auth: { getUser: async () => user }, repository: {
    consumeQuota: async () => true, createForOwner: async () => {}, getForOwner: async () => {}, deleteForOwner: async () => {},
    listForOwner: async uid => { accesses += 1; assert.equal(uid, 'synthetic-owner'); return { status: 'ok', items: [], nextCursor: null }; },
  } });
  return { handler, accesses: () => accesses };
}

test('callable requires verified App Check, production origin and current verified Auth', async () => {
  const f = fixture();
  assert.deepEqual(await f.handler(request()), { items: [], nextCursor: null });
  for (const change of [value => value.auth = null, value => value.app = null, value => value.app.appId = 'other-app',
    value => value.auth.token.email_verified = false, value => value.auth.token.auth_time = 0,
    value => value.rawRequest.get = () => 'https://other.example.invalid']) {
    const value = request(); change(value);
    await assert.rejects(f.handler(value), { code: 'unauthenticated' });
  }
  assert.equal(f.accesses(), 1);
});

test('disabled, revoked, unverified and mismatched authoritative users cannot read', async () => {
  const base = { uid: 'synthetic-owner', emailVerified: true, tokensValidAfterTime: '2023-11-14T22:13:19Z' };
  for (const change of [{ disabled: true }, { emailVerified: false }, { tokensValidAfterTime: '2023-11-14T22:13:21Z' }, { uid: 'another-owner' }, { tokensValidAfterTime: 'invalid' }]) {
    const f = fixture({ ...base, ...change });
    await assert.rejects(f.handler(request()), { code: 'unauthenticated' });
    assert.equal(f.accesses(), 0);
  }
});

test('claimed identity, unsupported actions and malformed envelopes are rejected', async () => {
  const f = fixture();
  for (const data of [{ action: 'list', payload: { cursor: null }, uid: 'other-owner' }, { action: 'checkout', payload: {} }, { action: 'list', payload: { cursor: null, uid: 'other-owner' } }, null, [], {}]) {
    await assert.rejects(f.handler({ ...request(), data }), { code: 'invalid-argument' });
  }
  assert.equal(f.accesses(), 0);
});

test('an unactivated endpoint performs no Auth or repository operation', async () => {
  const handler = createAssessmentCallable({ auth: { getUser: () => assert.fail('Auth accessed') }, ErrorClass: PublicError });
  await assert.rejects(handler(request()), { code: 'failed-precondition' });
});

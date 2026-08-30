import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createQuickBooksWebhookProcessor} from '../../src/providers/quickbooks-webhooks.js';

const verifierToken = 'synthetic-verifier-token';
const realmId = '1234567890';

function rawWebhook(overrides = {}) {
  return Buffer.from(JSON.stringify({
    eventNotifications:[{
      realmId,
      dataChangeEvent:{entities:[
        {name:'Invoice',id:'30',operation:'Update',lastUpdated:'2026-08-29T18:00:00.000Z'},
        {name:'Payment',id:'40',operation:'Create',lastUpdated:'2026-08-29T18:00:01.000Z'},
      ]},
      ...overrides,
    }],
  }));
}

function signature(raw) {
  return createHmac('sha256', verifierToken).update(raw).digest('base64');
}

function fixture() {
  const hints = new Map();
  let orderWrites = 0;
  return {
    hints,
    get orderWrites() { return orderWrites; },
    processor: createQuickBooksWebhookProcessor({
      verifierToken,
      expectedRealmId: realmId,
      storeHint: async (id, hint) => {
        if (!hints.has(id)) hints.set(id, hint);
        return !hints.has(id);
      },
      updateOrder: async () => { orderWrites += 1; },
    }),
  };
}

test('verifies the exact raw bytes before attempting JSON parsing', async () => {
  const {processor, hints} = fixture();
  const invalidJson = Buffer.from('{not json');

  await assert.rejects(
    processor.acceptQuickBooksWebhook({rawBody: invalidJson, signature: 'invalid'}),
    {code:'WEBHOOK_SIGNATURE_INVALID'}
  );
  assert.equal(hints.size, 0);
  await assert.rejects(
    processor.acceptQuickBooksWebhook({rawBody: invalidJson, signature: signature(invalidJson)}),
    {code:'WEBHOOK_PAYLOAD_INVALID'}
  );
});

test('rejects validly signed notifications from the wrong realm', async () => {
  const {processor, hints} = fixture();
  const raw = rawWebhook({realmId:'wrong-realm'});

  await assert.rejects(
    processor.acceptQuickBooksWebhook({rawBody: raw, signature: signature(raw)}),
    {code:'WEBHOOK_REALM_INVALID'}
  );
  assert.equal(hints.size, 0);
});

test('stores only normalized Invoice and Payment reconciliation hints idempotently', async () => {
  const state = fixture();
  const raw = rawWebhook();
  const signed = signature(raw);

  assert.deepEqual(
    await state.processor.acceptQuickBooksWebhook({rawBody: raw, signature: signed}),
    {accepted:true}
  );
  await state.processor.acceptQuickBooksWebhook({rawBody: raw, signature: signed});

  assert.equal(state.hints.size, 2);
  assert.equal(state.orderWrites, 0);
  assert.deepEqual([...state.hints.values()], [
    {
      realmId,
      entityName:'Invoice',
      entityId:'30',
      operation:'Update',
      lastUpdated:'2026-08-29T18:00:00.000Z',
    },
    {
      realmId,
      entityName:'Payment',
      entityId:'40',
      operation:'Create',
      lastUpdated:'2026-08-29T18:00:01.000Z',
    },
  ]);
  const serialized = JSON.stringify([...state.hints.values()]);
  assert.equal(serialized.includes(signed), false);
  assert.equal(serialized.includes(raw.toString('base64')), false);
});

test('ignores non-payment entities and rejects malformed normalized identifiers', async () => {
  const state = fixture();
  const raw = Buffer.from(JSON.stringify({
    eventNotifications:[{
      realmId,
      dataChangeEvent:{entities:[
        {name:'Customer',id:'10',operation:'Update',lastUpdated:'2026-08-29T18:00:00.000Z'},
        {name:'Invoice',id:'bad id',operation:'Update',lastUpdated:'2026-08-29T18:00:00.000Z'},
      ]},
    }],
  }));

  await assert.rejects(
    state.processor.acceptQuickBooksWebhook({rawBody: raw, signature: signature(raw)}),
    {code:'WEBHOOK_PAYLOAD_INVALID'}
  );
  assert.equal(state.hints.size, 0);
});

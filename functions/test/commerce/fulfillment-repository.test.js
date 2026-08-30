import test from 'node:test';
import assert from 'node:assert/strict';
import {createFulfillmentRepository} from '../../src/commerce/fulfillment-repository.js';

class Snapshot {
  constructor(value) { this.value = value; this.exists = value !== undefined; }
  data() { return this.value === undefined ? undefined : structuredClone(this.value); }
}

class Ref {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  collection(name) { return new Collection(this.db, `${this.path}/${name}`); }
  async get() { return new Snapshot(this.db.docs.get(this.path)); }
}

class Collection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new Ref(this.db, `${this.path}/${id}`); }
}

function fakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([path,value]) => [path,structuredClone(value)]));
  let transactionQueue = Promise.resolve();
  const db = {
    docs,collection:name => new Collection(db,name),
    runTransaction(callback) {
      const run = transactionQueue.then(async () => {
        const writes = [];
        const transaction = {
          get:async reference => new Snapshot(docs.get(reference.path)),
          create:(reference,value) => writes.push(['create',reference.path,structuredClone(value)]),
          set:(reference,value) => writes.push(['set',reference.path,structuredClone(value)]),
          update:(reference,value) => writes.push(['update',reference.path,structuredClone(value)]),
        };
        const result = await callback(transaction);
        for (const [operation,path,value] of writes) {
          if (operation === 'create' && docs.has(path)) throw new Error('already exists');
          docs.set(path, operation === 'update' ? {...docs.get(path),...value} : value);
        }
        return result;
      });
      transactionQueue = run.catch(() => {});
      return run;
    },
  };
  return db;
}

const Timestamp = {fromDate:date => new Date(date)};
const fieldValue = {serverTimestamp:() => ({serverTimestamp:true})};
const now = new Date('2026-08-30T12:00:00.000Z');
const digest = 'a'.repeat(64);

function fixture(uid = 'owner-1') {
  const db = fakeFirestore({
    'orders/order-1':{id:'order-1',status:'fulfilled',orderType:'digital_product',
      fulfillmentType:'protected_download',sku:'guide',customerUid:uid},
    'fulfillmentGrants/order-1':{orderId:'order-1',status:'active',sku:'guide',
      customerUid:uid,fulfillmentType:'protected_download'},
  });
  return {db,repository:createFulfillmentRepository({db,fieldValue,Timestamp})};
}

test('accepts bounded Firebase custom UID characters and rejects controls or oversize UIDs', async () => {
  const customUid = 'custom:uid@example.com|tenant/abc';
  const {repository} = fixture(customUid);
  await repository.createDownloadGrant({orderId:'order-1',digest,customerUid:customUid,sku:'guide',
    issuedAt:now,expiresAt:new Date(now.getTime()+600000),consumedAt:null});
  assert.ok(await repository.consumeDownloadGrant({orderId:'order-1',digest,customerUid:customUid,
    sku:'guide',now}));
  for (const invalidUid of [`owner\nadmin`,'x'.repeat(129)]) {
    const state = fixture(invalidUid);
    await assert.rejects(state.repository.createDownloadGrant({orderId:'order-1',digest,
      customerUid:invalidUid,sku:'guide',issuedAt:now,
      expiresAt:new Date(now.getTime()+600000),consumedAt:null}), /invalid/i);
  }
});

test('transactionally creates a digest-only ten-minute grant bound to exact fulfilled owner and SKU', async () => {
  const {db,repository} = fixture();
  await repository.createDownloadGrant({orderId:'order-1',digest,customerUid:'owner-1',sku:'guide',
    issuedAt:now,expiresAt:new Date(now.getTime()+600000),consumedAt:null});
  const stored = db.docs.get(`fulfillmentGrants/order-1/downloadGrants/${digest}`);
  assert.deepEqual(Object.keys(stored).sort(), [
    'consumedAt','customerUid','digest','expiresAt','issuedAt','orderId','sku',
  ]);
  assert.equal(JSON.stringify(stored).includes('nonce'), false);
  assert.equal(stored.digest, digest);
});

test('grant creation fails closed for wrong owner, SKU, duration, or nonfulfilled order', async () => {
  for (const mutation of [
    grant => { grant.customerUid = 'attacker'; },
    grant => { grant.sku = 'wrong'; },
    grant => { grant.expiresAt = new Date(now.getTime()+600001); },
    (grant,db) => { db.docs.get('orders/order-1').status = 'paid'; },
  ]) {
    const {db,repository} = fixture();
    const grant = {orderId:'order-1',digest,customerUid:'owner-1',sku:'guide',issuedAt:now,
      expiresAt:new Date(now.getTime()+600000),consumedAt:null};
    mutation(grant,db);
    await assert.rejects(repository.createDownloadGrant(grant), /not allowed|invalid/i);
  }
});

test('atomic consume permits one concurrent winner and rejects replay at the expiry boundary', async () => {
  const {repository} = fixture();
  const grant = {orderId:'order-1',digest,customerUid:'owner-1',sku:'guide',issuedAt:now,
    expiresAt:new Date(now.getTime()+600000),consumedAt:null};
  await repository.createDownloadGrant(grant);
  const results = await Promise.all([
    repository.consumeDownloadGrant({orderId:'order-1',digest,customerUid:'owner-1',sku:'guide',now}),
    repository.consumeDownloadGrant({orderId:'order-1',digest,customerUid:'owner-1',sku:'guide',now}),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await repository.consumeDownloadGrant({orderId:'order-1',digest,
    customerUid:'owner-1',sku:'guide',now}), null);

  const second = 'b'.repeat(64);
  await repository.createDownloadGrant({...grant,digest:second});
  assert.equal(await repository.consumeDownloadGrant({orderId:'order-1',digest:second,
    customerUid:'owner-1',sku:'guide',now:new Date(now.getTime()+600000)}), null);
});

test('a new digest can be created after a consumed stream failure without changing entitlement', async () => {
  const {repository} = fixture();
  const first = {orderId:'order-1',digest,customerUid:'owner-1',sku:'guide',issuedAt:now,
    expiresAt:new Date(now.getTime()+600000),consumedAt:null};
  await repository.createDownloadGrant(first);
  assert.ok(await repository.consumeDownloadGrant({...first,now}));
  const second = {...first,digest:'c'.repeat(64)};
  await repository.createDownloadGrant(second);
  assert.ok(await repository.consumeDownloadGrant({...second,now}));
});

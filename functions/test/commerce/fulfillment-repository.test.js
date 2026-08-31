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
          delete:reference => writes.push(['delete',reference.path]),
        };
        const result = await callback(transaction);
        for (const [operation,path,value] of writes) {
          if (operation === 'create' && docs.has(path)) throw new Error('already exists');
          if (operation === 'delete') docs.delete(path);
          else docs.set(path, operation === 'update' ? {...docs.get(path),...value} : value);
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
  const stored = db.docs.get('fulfillmentGrants/order-1/downloadGrants/active');
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

test('permits only one active grant per order across parallel issuance', async () => {
  const {db,repository}=fixture();
  const base={orderId:'order-1',customerUid:'owner-1',sku:'guide',issuedAt:now,
    expiresAt:new Date(now.getTime()+600000),consumedAt:null};
  const results=await Promise.allSettled([
    repository.createDownloadGrant({...base,digest:'d'.repeat(64)}),
    repository.createDownloadGrant({...base,digest:'e'.repeat(64)}),
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.filter(result=>result.status==='rejected').length,1);
  const stored=db.docs.get('fulfillmentGrants/order-1/downloadGrants/active');
  assert.ok(['d'.repeat(64),'e'.repeat(64)].includes(stored.digest));
  assert.equal([...db.docs.keys()].filter(path=>path.includes('/downloadGrants/')).length,1);
});

test('reclaims one expired grant in place and deletes a consumed grant immediately', async () => {
  const {db,repository}=fixture();
  const first={orderId:'order-1',digest:'f'.repeat(64),customerUid:'owner-1',sku:'guide',
    issuedAt:now,expiresAt:new Date(now.getTime()+600000),consumedAt:null};
  await repository.createDownloadGrant(first);
  await assert.rejects(repository.createDownloadGrant({...first,digest:'1'.repeat(64)}),
    /active|conflict/i);
  const later=new Date(now.getTime()+600000);
  const replacement={...first,digest:'2'.repeat(64),issuedAt:later,
    expiresAt:new Date(later.getTime()+600000)};
  await repository.createDownloadGrant(replacement);
  assert.equal(db.docs.get('fulfillmentGrants/order-1/downloadGrants/active').digest,
    replacement.digest);
  assert.ok(await repository.consumeDownloadGrant({...replacement,now:later}));
  assert.equal(db.docs.has('fulfillmentGrants/order-1/downloadGrants/active'),false);
  assert.equal(await repository.consumeDownloadGrant({...replacement,now:later}),null);
});

test('bounds sequential per-owner order issuance while allowing limited fresh recovery', async () => {
  const {db,repository}=fixture();
  const base={orderId:'order-1',customerUid:'owner-1',sku:'guide',issuedAt:now,
    expiresAt:new Date(now.getTime()+600000),consumedAt:null};
  for (let index=0; index<5; index+=1) {
    const grant={...base,digest:String(index).repeat(64)};
    await repository.createDownloadGrant(grant);
    assert.ok(await repository.consumeDownloadGrant({...grant,now}));
  }
  await assert.rejects(repository.createDownloadGrant({...base,digest:'a'.repeat(64)}),
    /rate|limit|active|conflict/i);
  assert.equal(db.docs.has('fulfillmentGrants/order-1/downloadGrants/active'),false);

  const nextWindow=new Date(now.getTime()+600000);
  const recovered={...base,digest:'b'.repeat(64),issuedAt:nextWindow,
    expiresAt:new Date(nextWindow.getTime()+600000)};
  await repository.createDownloadGrant(recovered);
  assert.ok(await repository.consumeDownloadGrant({...recovered,now:nextWindow}));
});

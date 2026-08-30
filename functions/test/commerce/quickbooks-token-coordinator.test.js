import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  createFirestoreQuickBooksRefreshLeaseStore,
  createQuickBooksRefreshSecretStore,
  createQuickBooksTokenCoordinator,
} from '../../src/commerce/quickbooks-token-coordinator.js';
import {createQuickBooksClient,refreshQuickBooksAccessToken} from '../../src/providers/quickbooks.js';

function harness(overrides = {}) {
  let latest = {value:'refresh-initial',version:'1'};
  let lease = null;
  const events = [];
  const secretStore = {
    async readLatest() { events.push(['read',latest.version]); return {...latest}; },
    async addVersion(value) { events.push(['add',value]); latest = {value,version:String(Number(latest.version)+1)}; return {version:latest.version}; },
    async readVersion(version) { return version === latest.version ? {...latest} : null; },
    ...overrides.secretStore,
  };
  const leaseStore = {
    async acquire({ownerId,nowMs,expiresAtMs}) {
      if (lease && lease.expiresAtMs > nowMs && lease.ownerId !== ownerId) return false;
      lease = {ownerId,expiresAtMs};
      events.push(['lease',ownerId]);
      return true;
    },
    async release({ownerId,receipt}) {
      if (lease?.ownerId !== ownerId) return false;
      events.push(['release',receipt]);
      lease = null;
      return true;
    },
    ...overrides.leaseStore,
  };
  let refreshes = 0;
  const refresh = overrides.refresh ?? (async token => {
    refreshes += 1;
    events.push(['refresh',token]);
    return {accessToken:'access-value',refreshToken:'refresh-rotated',expiresIn:3600};
  });
  const coordinator = createQuickBooksTokenCoordinator({
    secretStore,leaseStore,refresh,ownerIdFactory:()=>'owner-1',clock:()=>new Date(0),
    sleep:async()=>{},...overrides.options,
  });
  return {coordinator,events,refreshes:()=>refreshes,setLease:value=>{lease=value;}};
}

test('persists and reads back the rotated refresh token before returning an access token', async () => {
  const state = harness();
  assert.equal(await state.coordinator.getAccessToken(), 'access-value');
  assert.deepEqual(state.events.map(event=>event[0]), ['lease','read','refresh','add','release']);
  assert.equal(state.events.at(-1)[1].sourceVersion, '1');
  assert.equal(state.events.at(-1)[1].storedVersion, '2');
});

test('coalesces parallel requests so only one refresh token exchange occurs', async () => {
  let unblock;
  const state = harness({refresh:async()=>new Promise(resolve=>{unblock=()=>resolve({accessToken:'access-value',refreshToken:'refresh-rotated',expiresIn:3600});})});
  const first = state.coordinator.getAccessToken();
  const second = state.coordinator.getAccessToken();
  await new Promise(resolve=>setImmediate(resolve));
  unblock();
  assert.deepEqual(await Promise.all([first,second]), ['access-value','access-value']);
  assert.equal(state.events.filter(event=>event[0]==='lease').length, 1);
});

test('recovers an expired lease but does not take an active lease', async () => {
  const active = harness({options:{maxWaitMs:0}});
  active.setLease({ownerId:'other',expiresAtMs:1});
  await assert.rejects(active.coordinator.getAccessToken(), /temporarily unavailable/);
  const expired = harness();
  expired.setLease({ownerId:'other',expiresAtMs:-1});
  assert.equal(await expired.coordinator.getAccessToken(), 'access-value');
});

test('invalid_grant is redacted, releases the lease, and persists no token material', async () => {
  const state = harness({refresh:async()=>{const error=new Error('provider body refresh-initial invalid_grant');error.code='invalid_grant';throw error;}});
  await assert.rejects(state.coordinator.getAccessToken(), error => {
    assert.equal(error.code, 'QBO_RECONNECT_REQUIRED');
    assert.doesNotMatch(error.message, /refresh-initial|invalid_grant/);
    return true;
  });
  assert.equal(state.events.some(event=>event[0]==='add'), false);
  assert.equal(state.events.at(-1)[0], 'release');
});

test('fails closed without returning access when rotated-token persistence fails', async () => {
  const state = harness({secretStore:{async addVersion(){throw new Error('write failed');}}});
  await assert.rejects(state.coordinator.getAccessToken(), /operator review/);
  assert.equal(state.events.at(-1)[0], 'release');
});

test('accepts an ambiguous add only when latest-version readback proves the rotated value', async () => {
  let latest = {value:'old',version:'7'};
  const state = harness({secretStore:{
    async readLatest(){return {...latest};},
    async addVersion(value){latest={value,version:'8'};const error=new Error('deadline');error.code=4;throw error;},
    async readVersion(){return null;},
  }});
  assert.equal(await state.coordinator.getAccessToken(), 'access-value');
});

test('never places refresh or access token material in lease receipts or errors', async () => {
  const state = harness();
  await state.coordinator.getAccessToken();
  const serialized = JSON.stringify(state.events.filter(event=>event[0]==='release'));
  assert.doesNotMatch(serialized, /refresh-initial|refresh-rotated|access-value/);
});

test('QuickBooks accounting requests obtain access through the coordinator boundary', async () => {
  const events = [];
  const client = createQuickBooksClient({
    realmId:'realm',
    accessTokenProvider:{async getAccessToken(){events.push('credential-durable');return 'access-value';}},
  }, async url => {
    events.push(String(url));
    return new Response(JSON.stringify({Payment:{
      Id:'payment-1',TotalAmt:10,UnappliedAmt:10,Line:[],
    }}),{status:200,headers:{'content-type':'application/json'}});
  });
  await client.getPayment('payment-1');
  assert.equal(events[0], 'credential-durable');
  assert.match(events[1], /quickbooks\.api\.intuit\.com/);
});

test('QuickBooks makes no accounting request when credential persistence fails closed', async () => {
  let providerRequests = 0;
  const client = createQuickBooksClient({
    realmId:'realm',
    accessTokenProvider:{async getAccessToken(){throw new Error('credential persistence failed');}},
  }, async () => {providerRequests += 1;throw new Error('must not call provider');});
  await assert.rejects(client.getPayment('payment-1'), /credential persistence failed/);
  assert.equal(providerRequests, 0);
});

test('Secret Manager adapter always reads latest and verifies exact added versions', async () => {
  const calls=[];
  const client={
    async accessSecretVersion({name}){calls.push(['access',name]);return [{name:name.replace('/latest','/versions/9'),payload:{data:Buffer.from('secret-value')}}];},
    async addSecretVersion({parent,payload}){calls.push(['add',parent,payload]);return [{name:`${parent}/versions/9`}];},
  };
  const store=createQuickBooksRefreshSecretStore({client,projectId:'project-1'});
  assert.deepEqual(await store.readLatest(),{value:'secret-value',version:'9'});
  assert.deepEqual(await store.addVersion('rotated-value'),{version:'9'});
  assert.deepEqual(await store.readVersion('9'),{value:'secret-value',version:'9'});
  assert.equal(calls[0][1],'projects/project-1/secrets/QBO_REFRESH_TOKEN/versions/latest');
  assert.equal(calls[1][1],'projects/project-1/secrets/QBO_REFRESH_TOKEN');
});

test('Firestore lease adapter persists only owner, expiry, and redacted version receipt metadata', async () => {
  let document=null;
  const reference={};
  const db={
    collection(){return {doc(){return reference;}};},
    async runTransaction(callback){
      return callback({
        async get(){return {exists:document!==null,data:()=>document};},
        set(_ref,value){document=value;},
        delete(){document=null;},
      });
    },
  };
  const store=createFirestoreQuickBooksRefreshLeaseStore({db});
  assert.equal(await store.acquire({ownerId:'owner',nowMs:10,expiresAtMs:100}),true);
  assert.deepEqual(document,{ownerId:'owner',expiresAtMs:100});
  assert.equal(await store.release({ownerId:'owner',receipt:{status:'rotated',sourceVersion:'1',storedVersion:'2'}}),true);
  const serialized=JSON.stringify(document);
  assert.doesNotMatch(serialized,/token|secret|access|refresh/i);
});

test('refresh helper returns validated OAuth fields and redacts invalid_grant failures', async () => {
  const success=await refreshQuickBooksAccessToken({clientId:'id',clientSecret:'secret',refreshToken:'old'},async()=>
    new Response(JSON.stringify({access_token:'access',refresh_token:'rotated',expires_in:3600}),{status:200})
  );
  assert.deepEqual(success,{accessToken:'access',refreshToken:'rotated',expiresIn:3600});
  await assert.rejects(
    refreshQuickBooksAccessToken({clientId:'id',clientSecret:'secret',refreshToken:'sensitive-old'},async()=>
      new Response(JSON.stringify({error:'invalid_grant',error_description:'sensitive-old expired'}),{status:400})
    ),
    error=>error.code==='invalid_grant' && !/sensitive-old/.test(error.message),
  );
});

test('runtime wiring uses latest-version coordination instead of the deployment-pinned refresh value', async () => {
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.match(source,/createQuickBooksRefreshSecretStore/);
  assert.match(source,/createFirestoreQuickBooksRefreshLeaseStore/);
  assert.match(source,/createQuickBooksTokenCoordinator/);
  assert.match(source,/refreshQuickBooksAccessToken/);
  assert.doesNotMatch(source,/refreshToken\s*:\s*QBO_REFRESH_TOKEN\.value\(\)/);
  assert.match(source,/accessTokenProvider\s*:\s*quickBooksTokenCoordinator\(\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBoundQuickBooksCredentialCoordinator,createFirestoreQuickBooksCredentialStore,publishQuickBooksReconnect} from '../../src/commerce/quickbooks-credential-binding.js';

function firestoreHarness(initial={}){
  const docs=new Map(Object.entries(initial));
  const db={collection(name){return {doc(id=`auto-${docs.size}`){return {path:`${name}/${id}`};}};},async runTransaction(callback){return callback({async get(ref){const value=docs.get(ref.path);return {exists:value!==undefined,data:()=>value};},set(ref,value){docs.set(ref.path,structuredClone(value));}});}};
  return {db,docs};
}

test('published binding exposes one exact paired token and realm generation',async()=>{
  const state=firestoreHarness({'integrationControl/qbo-credential-binding':{status:'idle',generation:4,refreshTokenVersion:'12',realmVersion:'7',publishedAtMs:100}});
  const store=createFirestoreQuickBooksCredentialStore({db:state.db});
  assert.deepEqual(await store.readPublished(),{generation:4,refreshTokenVersion:'12',realmVersion:'7'});
});

test('rotation atomically publishes only against the captured generation and pair',async()=>{
  const state=firestoreHarness({'integrationControl/qbo-credential-binding':{status:'idle',generation:4,refreshTokenVersion:'12',realmVersion:'7',publishedAtMs:100}});
  const store=createFirestoreQuickBooksCredentialStore({db:state.db});
  const binding=await store.readPublished();
  assert.deepEqual(await store.claimRefresh({ownerId:'owner',binding,nowMs:110,expiresAtMs:200}),{status:'claimed'});
  assert.equal(await store.markDispatchStarted({ownerId:'owner',generation:4,nowMs:120}),true);
  assert.equal(await store.publishRotation({ownerId:'owner',generation:4,refreshTokenVersion:'13',realmVersion:'7',nowMs:130}),true);
  assert.deepEqual(await store.readPublished(),{generation:5,refreshTokenVersion:'13',realmVersion:'7'});
});

test('an old worker may create a higher orphan version but can never publish after reconnect fences it',async()=>{
  const state=firestoreHarness({'integrationControl/qbo-credential-binding':{status:'idle',generation:4,refreshTokenVersion:'12',realmVersion:'7',publishedAtMs:100}});
  const store=createFirestoreQuickBooksCredentialStore({db:state.db});
  const binding=await store.readPublished();
  await store.claimRefresh({ownerId:'old',binding,nowMs:110,expiresAtMs:200});
  await store.markDispatchStarted({ownerId:'old',generation:4,nowMs:120});
  assert.deepEqual(await store.beginReconnect({nowMs:125}),{generation:5});
  assert.equal(await store.publishRotation({ownerId:'old',generation:4,refreshTokenVersion:'99',realmVersion:'7',nowMs:130}),false);
  await store.recordAlert({reason:'qbo_reconnect_required',nowMs:131});
  assert.equal(state.docs.get('integrationAlerts/auto-2').reason,'qbo_reconnect_required');
});

test('reconnect publishes token and realm as one pair only after both exact versions exist',async()=>{
  const state=firestoreHarness({'integrationControl/qbo-credential-binding':{status:'idle',generation:4,refreshTokenVersion:'12',realmVersion:'7',publishedAtMs:100}});
  const store=createFirestoreQuickBooksCredentialStore({db:state.db});
  const reconnect=await store.beginReconnect({nowMs:200});
  await store.failReconnect({generation:reconnect.generation,reason:'qbo_reconnect_required',nowMs:201});
  assert.deepEqual(state.docs.get('integrationControl/qbo-credential-binding'),{status:'manual_review',generation:5,refreshTokenVersion:'12',realmVersion:'7',publishedAtMs:100,reason:'qbo_reconnect_required',updatedAtMs:201});
  assert.equal(await store.publishReconnect({generation:5,refreshTokenVersion:'20',realmVersion:'8',nowMs:202}),false);
});

test('runtime reads only bound exact versions and ignores a later orphan',async()=>{
  const reads=[];const credentialStore={async readPublished(){return {generation:2,refreshTokenVersion:'4',realmVersion:'3'};},async claimRefresh(){return {status:'claimed'};},async markDispatchStarted(){return true;},async verifyPublishFence(){return true;},async publishRotation(){return true;},async requireManualReview(){},async failBeforeDispatch(){},async recordAlert(){}};
  const tokenStore={async readVersion(version){reads.push(['token',version]);return {value:version==='5'?'rotated':'bound-token',version};},async addVersion(){return {version:'5'};}};
  const realmStore={async readVersion(version){reads.push(['realm',version]);return {value:'bound-realm',version};}};
  const coordinator=createBoundQuickBooksCredentialCoordinator({credentialStore,tokenStore,realmStore,refresh:async()=>({accessToken:'access',refreshToken:'rotated',expiresIn:3600}),clock:()=>new Date(10),ownerIdFactory:()=>'owner'});
  assert.deepEqual(await coordinator.getCredentials(),{accessToken:'access',realmId:'bound-realm'});
  assert.deepEqual(reads,[['token','4'],['realm','3'],['token','5']]);
});

test('an absent published binding fails closed before any Secret Manager or Intuit call',async()=>{
  const calls=[];const credentialStore={async readPublished(){throw new Error('binding unavailable');},async claimRefresh(){},async markDispatchStarted(){},async verifyPublishFence(){},async publishRotation(){},async requireManualReview(){},async failBeforeDispatch(){},async recordAlert(){}};
  const tokenStore={async readVersion(){calls.push('token-read');},async addVersion(){calls.push('token-add');}};
  const realmStore={async readVersion(){calls.push('realm-read');}};
  const coordinator=createBoundQuickBooksCredentialCoordinator({credentialStore,tokenStore,realmStore,refresh:async()=>{calls.push('refresh');}});
  await assert.rejects(coordinator.getCredentials(),/binding unavailable/);
  assert.deepEqual(calls,[]);
});

test('a reconnect fence after rotated-token persistence leaves an orphan and emits an independent alert',async()=>{
  const calls=[];const credentialStore={async readPublished(){return {generation:2,refreshTokenVersion:'4',realmVersion:'3'};},async claimRefresh(){return {status:'claimed'};},async markDispatchStarted(){return true;},async verifyPublishFence(){return true;},async publishRotation(){calls.push('publish-rejected');return false;},async requireManualReview(){calls.push('owned-review-rejected');return false;},async failBeforeDispatch(){},async recordAlert(input){calls.push(input.reason);}};
  const tokenStore={async readVersion(version){return {value:version==='5'?'rotated':'bound-token',version};},async addVersion(){calls.push('orphan-5');return {version:'5'};}};
  const realmStore={async readVersion(version){return {value:'bound-realm',version};}};
  const coordinator=createBoundQuickBooksCredentialCoordinator({credentialStore,tokenStore,realmStore,refresh:async()=>({accessToken:'access',refreshToken:'rotated',expiresIn:3600}),clock:()=>new Date(10),ownerIdFactory:()=>'old-owner'});
  await assert.rejects(coordinator.getCredentials(),error=>error.code==='QBO_RECONNECT_REQUIRED');
  assert.deepEqual(calls,['orphan-5','publish-rejected','qbo_reconnect_required','owned-review-rejected']);
});

test('an ambiguous rotated-token add is persistence-unknown and never publishes',async()=>{
  const calls=[];const credentialStore={async readPublished(){return {generation:2,refreshTokenVersion:'4',realmVersion:'3'};},async claimRefresh(){return {status:'claimed'};},async markDispatchStarted(){return true;},async verifyPublishFence(){return true;},async publishRotation(){calls.push('publish');return true;},async requireManualReview(input){calls.push(input.reason);return true;},async failBeforeDispatch(){},async recordAlert(){}};
  const tokenStore={async readVersion(version){return {value:'bound-token',version};},async addVersion(){throw new Error('outcome unknown');}};
  const realmStore={async readVersion(version){return {value:'bound-realm',version};}};
  const coordinator=createBoundQuickBooksCredentialCoordinator({credentialStore,tokenStore,realmStore,refresh:async()=>({accessToken:'access',refreshToken:'rotated',expiresIn:3600}),clock:()=>new Date(10),ownerIdFactory:()=>'owner'});
  await assert.rejects(coordinator.getCredentials(),error=>error.code==='QBO_REFRESH_PERSISTENCE_UNKNOWN');
  assert.deepEqual(calls,['qbo_refresh_persistence_unknown']);
});

test('a bounded refresh timeout is preserved for durable manual review without an Accounting call',async()=>{
  const calls=[];const credentialStore={async readPublished(){return {generation:2,refreshTokenVersion:'4',realmVersion:'3'};},async claimRefresh(){return {status:'claimed'};},async markDispatchStarted(){return true;},async verifyPublishFence(){calls.push('publish-fence');return true;},async publishRotation(){calls.push('publish');return true;},async requireManualReview(input){calls.push(input.reason);return true;},async failBeforeDispatch(){},async recordAlert(){}};
  const tokenStore={async readVersion(version){return {value:'bound-token',version};},async addVersion(){calls.push('token-add');return {version:'5'};}};
  const realmStore={async readVersion(version){return {value:'bound-realm',version};}};
  const timeout=Object.assign(new Error('provider detail'),{code:'QBO_REFRESH_TIMEOUT'});
  const coordinator=createBoundQuickBooksCredentialCoordinator({credentialStore,tokenStore,realmStore,refresh:async()=>{calls.push('refresh');throw timeout;},clock:()=>new Date(10),ownerIdFactory:()=>'owner'});
  await assert.rejects(coordinator.getCredentials(),error=>error.code==='QBO_REFRESH_TIMEOUT'&&error.message==='QuickBooks authentication timed out');
  assert.deepEqual(calls,['refresh','qbo_refresh_timeout']);
});

test('an accepted unchanged Intuit refresh token republishes the exact bound version without creating an orphan',async()=>{
  const calls=[];const credentialStore={async readPublished(){return {generation:2,refreshTokenVersion:'4',realmVersion:'3'};},async claimRefresh(){return {status:'claimed'};},async markDispatchStarted(){return true;},async verifyPublishFence(){return true;},async publishRotation(input){calls.push(['publish',input.refreshTokenVersion,input.realmVersion]);return true;},async requireManualReview(input){calls.push(['review',input.reason]);},async failBeforeDispatch(){},async recordAlert(){}};
  const tokenStore={async readVersion(version){return {value:'bound-token',version};},async addVersion(){calls.push('token-add');throw new Error('must not add');}};
  const realmStore={async readVersion(version){return {value:'bound-realm',version};}};
  const coordinator=createBoundQuickBooksCredentialCoordinator({credentialStore,tokenStore,realmStore,refresh:async()=>({accessToken:'access',refreshToken:'bound-token',expiresIn:3600}),clock:()=>new Date(10),ownerIdFactory:()=>'owner'});
  assert.deepEqual(await coordinator.getCredentials(),{accessToken:'access',realmId:'bound-realm'});
  assert.deepEqual(calls,[['publish','4','3']]);
});

test('partial reconnect writes never publish a mixed pair',async()=>{
  const calls=[];const credentialStore={async beginReconnect(){return {generation:8};},async publishReconnect(){calls.push('publish');return true;},async failReconnect(input){calls.push(input.reason);}};
  const tokenStore={async addVersion(){return {version:'20'};},async readVersion(){return {value:'new-token',version:'20'};}};
  const realmStore={async addVersion(){throw new Error('realm write failed');},async readVersion(){throw new Error('no realm');}};
  await assert.rejects(publishQuickBooksReconnect({credentialStore,tokenStore,realmStore,refreshToken:'new-token',realmId:'new-realm',clock:()=>new Date(50)}));
  assert.deepEqual(calls,['qbo_reconnect_required']);
});

test('a realm-only reconnect orphan is never published when token persistence fails',async()=>{
  const calls=[];const credentialStore={async beginReconnect(){return {generation:9};},async publishReconnect(){calls.push('publish');return true;},async failReconnect(input){calls.push(input.reason);}};
  const tokenStore={async addVersion(){throw new Error('token write failed');},async readVersion(){throw new Error('no token');}};
  const realmStore={async addVersion(){calls.push('realm-added');return {version:'31'};},async readVersion(){return {value:'new-realm',version:'31'};}};
  await assert.rejects(publishQuickBooksReconnect({credentialStore,tokenStore,realmStore,refreshToken:'new-token',realmId:'new-realm',clock:()=>new Date(60)}));
  assert.deepEqual(calls,['realm-added','qbo_reconnect_required']);
});

test('reconnect reports success only after exact token and realm readback and paired publish',async()=>{
  const calls=[];const credentialStore={async beginReconnect(){calls.push('fenced');return {generation:10};},async publishReconnect(input){calls.push(['published',input.refreshTokenVersion,input.realmVersion]);return true;},async failReconnect(){calls.push('failed');}};
  const tokenStore={async addVersion(){calls.push('token-added');return {version:'40'};},async readVersion(version){calls.push(['token-read',version]);return {value:'new-token',version};}};
  const realmStore={async addVersion(){calls.push('realm-added');return {version:'12'};},async readVersion(version){calls.push(['realm-read',version]);return {value:'new-realm',version};}};
  assert.deepEqual(await publishQuickBooksReconnect({credentialStore,tokenStore,realmStore,refreshToken:'new-token',realmId:'new-realm',clock:()=>new Date(70)}),{connected:true});
  assert.equal(calls[0],'fenced');
  assert.deepEqual(calls.at(-1),['published','40','12']);
  assert.ok(calls.includes('token-added'));
  assert.ok(calls.includes('realm-added'));
});

test('runtime source has neither token nor realm deployment-pinned bindings',async()=>{
  const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/defineSecret\(['"]QBO_(?:REFRESH_TOKEN|REALM_ID)/);
  assert.doesNotMatch(source,/QBO_REALM_ID\.value/);
  assert.match(source,/publishQuickBooksReconnect/);
});

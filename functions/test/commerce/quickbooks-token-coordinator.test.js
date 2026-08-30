import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFirestoreQuickBooksRefreshLeaseStore,createQuickBooksRefreshSecretStore,createQuickBooksTokenCoordinator} from '../../src/commerce/quickbooks-token-coordinator.js';
import {createQuickBooksClient,refreshQuickBooksAccessToken} from '../../src/providers/quickbooks.js';

function harness(overrides={}) {
  let latest={value:'credential-initial',version:'1'};let state=null;const events=[];
  const secretStore={
    async readLatestEnabled(){events.push(['read',latest.version]);return {...latest};},
    async addVersion(value){events.push(['add',value]);latest={value,version:String(Number(latest.version)+1)};return {version:latest.version};},
    async readVersion(version){return version===latest.version?{...latest}:null;},...overrides.secretStore,
  };
  const leaseStore={
    async claim({ownerId,nowMs,expiresAtMs}){if(state?.manualReviewReason)return {status:'manual_review',reason:state.manualReviewReason};if(state?.ownerId&&state.expiresAtMs>nowMs)return {status:'busy'};if(state?.dispatchStartedAtMs){state={manualReviewReason:'qbo_reconnect_required'};events.push(['alert','qbo_reconnect_required']);return {status:'manual_review',reason:'qbo_reconnect_required'};}state={ownerId,expiresAtMs,dispatchStartedAtMs:null,attemptCount:0};events.push(['claim',ownerId]);return {status:'claimed'};},
    async markDispatchStarted({ownerId,nowMs}){if(state?.ownerId!==ownerId||state.expiresAtMs<=nowMs||state.dispatchStartedAtMs)return false;state={...state,dispatchStartedAtMs:nowMs,attemptCount:1};events.push(['started',ownerId]);return true;},
    async verifyStartedOwner({ownerId}){return state?.ownerId===ownerId&&state.dispatchStartedAtMs!=null&&state.attemptCount===1;},
    async complete({ownerId,receipt}){if(state?.ownerId!==ownerId)return false;events.push(['complete',receipt]);state=null;return true;},
    async failBeforeDispatch({ownerId,reason}){if(state?.ownerId!==ownerId||state.dispatchStartedAtMs)return false;events.push(['predispatch',reason]);state=null;return true;},
    async requireManualReview({ownerId,reason}){if(state?.ownerId!==ownerId)return false;state={manualReviewReason:reason};events.push(['alert',reason]);return true;},...overrides.leaseStore,
  };
  const refresh=overrides.refresh??(async value=>{events.push(['refresh',value]);return {accessToken:'access-value',refreshToken:'credential-rotated',expiresIn:3600};});
  const coordinator=createQuickBooksTokenCoordinator({secretStore,leaseStore,refresh,ownerIdFactory:()=>overrides.ownerId??'owner-1',clock:overrides.clock??(()=>new Date(100)),sleep:overrides.sleep??(async()=>{}),maxWaitMs:overrides.maxWaitMs??0,leaseMs:1000,crashHook:overrides.crashHook});
  return {coordinator,events,setState:value=>{state=value;},getState:()=>state};
}

test('marks dispatch once, persists exact rotation, then permits Accounting access',async()=>{const state=harness();assert.equal(await state.coordinator.getAccessToken(),'access-value');assert.deepEqual(state.events.map(event=>event[0]),['claim','read','started','refresh','add','complete']);assert.deepEqual(state.events.at(-1)[1],{status:'rotated',sourceVersion:'1',storedVersion:'2'});});

test('coalesces same-runtime requests into one one-attempt refresh',async()=>{let unblock;const state=harness({refresh:async()=>new Promise(resolve=>{unblock=()=>resolve({accessToken:'access-value',refreshToken:'credential-rotated',expiresIn:3600});})});const one=state.coordinator.getAccessToken();const two=state.coordinator.getAccessToken();await new Promise(resolve=>setImmediate(resolve));unblock();assert.deepEqual(await Promise.all([one,two]),['access-value','access-value']);assert.equal(state.events.filter(event=>event[0]==='started').length,1);});

test('a hung refresh past lease expiry can never be refreshed by a second runtime',async()=>{const state=harness();state.setState({ownerId:'first',expiresAtMs:99,dispatchStartedAtMs:50,attemptCount:1});await assert.rejects(state.coordinator.getAccessToken(),error=>error.code==='QBO_RECONNECT_REQUIRED');assert.equal(state.events.some(event=>event[0]==='refresh'),false);assert.deepEqual(state.events.at(-1),['alert','qbo_reconnect_required']);});

test('clock skew cannot steal an active claim',async()=>{const state=harness({clock:()=>new Date(10_000)});state.setState({ownerId:'first',expiresAtMs:20_000,dispatchStartedAtMs:9_000,attemptCount:1});await assert.rejects(state.coordinator.getAccessToken(),error=>error.code==='QBO_REFRESH_BUSY');assert.equal(state.events.length,0);});

test('only a never-started expired claim is safely reclaimed',async()=>{const state=harness();state.setState({ownerId:'dead',expiresAtMs:99,dispatchStartedAtMs:null,attemptCount:0});assert.equal(await state.coordinator.getAccessToken(),'access-value');});

test('invalid_grant creates a durable reconnect alert and exposes no provider material',async()=>{const state=harness({refresh:async()=>{const error=new Error('credential-initial invalid');error.code='invalid_grant';throw error;}});await assert.rejects(state.coordinator.getAccessToken(),error=>error.code==='QBO_RECONNECT_REQUIRED'&&!/credential-initial/.test(error.message));assert.deepEqual(state.events.at(-1),['alert','qbo_reconnect_required']);});

test('unconfirmed add ambiguity becomes durable persistence-unknown manual review',async()=>{const state=harness({secretStore:{async addVersion(){throw new Error('deadline');},async readLatestEnabled(){return {value:'credential-initial',version:'1'};}}});await assert.rejects(state.coordinator.getAccessToken(),error=>error.code==='QBO_REFRESH_PERSISTENCE_UNKNOWN');assert.deepEqual(state.events.at(-1),['alert','qbo_refresh_persistence_unknown']);});

test('ambiguous add proceeds only when highest enabled readback matches',async()=>{let current={value:'credential-initial',version:'7'};const state=harness({secretStore:{async readLatestEnabled(){return {...current};},async addVersion(value){current={value,version:'8'};throw new Error('deadline');},async readVersion(){return null;}}});assert.equal(await state.coordinator.getAccessToken(),'access-value');});

for(const boundary of ['after_claim','after_source_read','after_dispatch_started','after_provider_refresh'])test(`crash hook at ${boundary} never permits unsafe retry`,async()=>{const state=harness({crashHook:point=>{if(point===boundary)throw new Error('synthetic crash');}});await assert.rejects(state.coordinator.getAccessToken());const doc=state.getState();if(boundary==='after_claim'||boundary==='after_source_read')assert.equal(doc,null);else assert.equal(doc.manualReviewReason,'qbo_reconnect_required');});

test('an add response lost after commit is recovered only by matching enabled readback',async()=>{const state=harness({crashHook:point=>{if(point==='after_secret_add')throw new Error('synthetic lost response');}});assert.equal(await state.coordinator.getAccessToken(),'access-value');assert.equal(state.getState(),null);});

test('Secret Manager chooses highest enabled numeric version and applies deadlines',async()=>{const calls=[];const client={async listSecretVersions(request,options){calls.push(['list',request,options]);return [[{name:`${request.parent}/versions/11`,state:'DISABLED'},{name:`${request.parent}/versions/9`,state:'ENABLED'},{name:`${request.parent}/versions/10`,state:1},{name:`${request.parent}/versions/12`,state:'DESTROYED'}]];},async accessSecretVersion({name},options){calls.push(['access',name,options]);return [{name,payload:{data:Buffer.from(name.endsWith('/10')?'ten':'other')}}];},async addSecretVersion({parent,payload},options){calls.push(['add',parent,payload,options]);return [{name:`${parent}/versions/13`}];}};const store=createQuickBooksRefreshSecretStore({client,projectId:'project-1',timeoutMs:1234});assert.deepEqual(await store.readLatestEnabled(),{value:'ten',version:'10'});assert.deepEqual(await store.addVersion('next'),{version:'13'});assert.deepEqual(await store.readVersion('10'),{value:'ten',version:'10'});assert.equal(calls.every(call=>call.at(-1).timeout===1234),true);});

test('Firestore refuses post-dispatch reclaim and reconnect explicitly resets manual review',async()=>{let document=null;const alerts=[];const reference={kind:'control'};const db={collection(name){return name==='integrationAlerts'?{doc:id=>({kind:'alert',id})}:{doc:()=>reference};},async runTransaction(callback){return callback({async get(){return {exists:document!==null,data:()=>document};},set(ref,value){if(ref.kind==='alert')alerts.push(value);else document=value;}});}};const store=createFirestoreQuickBooksRefreshLeaseStore({db});assert.deepEqual(await store.claim({ownerId:'one',nowMs:10,expiresAtMs:20}),{status:'claimed'});assert.equal(await store.markDispatchStarted({ownerId:'one',nowMs:11}),true);assert.deepEqual(await store.claim({ownerId:'two',nowMs:21,expiresAtMs:30}),{status:'manual_review',reason:'qbo_reconnect_required'});assert.equal(alerts[0].reason,'qbo_reconnect_required');await store.resetAfterReconnect({nowMs:22});assert.equal(document.status,'idle');assert.doesNotMatch(JSON.stringify({document,alerts}),/credential|access|token|secret/i);});

test('Intuit refresh has bounded abort deadline and redacts timeout',async()=>{let signal;await assert.rejects(refreshQuickBooksAccessToken({clientId:'id',clientSecret:'safe',refreshToken:'old'},async(_url,options)=>{signal=options.signal;const error=new Error('aborted old');error.name='AbortError';throw error;},{timeoutMs:25}),error=>error.code==='QBO_REFRESH_TIMEOUT'&&!/old/.test(error.message));assert.ok(signal instanceof AbortSignal);});

test('QuickBooks makes no Accounting request when coordinator fails',async()=>{let calls=0;const client=createQuickBooksClient({realmId:'realm',accessTokenProvider:{async getAccessToken(){throw new Error('blocked');}}},async()=>{calls++;});await assert.rejects(client.getPayment('payment-1'),/blocked/);assert.equal(calls,0);});

test('QuickBooks Accounting calls carry a bounded abort deadline',async()=>{let signal;const client=createQuickBooksClient({realmId:'realm',accessTokenProvider:{async getAccessToken(){return 'access';}}},async(_url,options)=>{signal=options.signal;return new Response(JSON.stringify({Payment:{Id:'payment-1',TotalAmt:10,UnappliedAmt:10,Line:[]}}),{status:200});});await client.getPayment('payment-1');assert.ok(signal instanceof AbortSignal);});

test('runtime has no deployment-pinned QBO refresh declaration or binding',async()=>{const source=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');assert.doesNotMatch(source,/defineSecret\(['"]QBO_REFRESH_TOKEN/);assert.doesNotMatch(source,/QBO_SECRETS/);assert.match(source,/accessTokenProvider\s*:\s*quickBooksTokenCoordinator\(\)/);assert.match(source,/resetAfterReconnect/);});

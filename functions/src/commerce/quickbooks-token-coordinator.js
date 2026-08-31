import {timingSafeEqual,randomUUID} from 'node:crypto';

const DEFAULT_LEASE_MS=4*60*1000;
const DEFAULT_WAIT_MS=15*1000;
const DEFAULT_SECRET_TIMEOUT_MS=8*1000;
const SAFE_REASONS=new Set(['qbo_refresh_busy','qbo_refresh_predispatch_retry','qbo_reconnect_required','qbo_refresh_persistence_unknown','qbo_refresh_timeout']);

function safeEqual(left,right){const a=Buffer.from(String(left));const b=Buffer.from(String(right));return a.length===b.length&&timingSafeEqual(a,b);}
function publicError(code,message){const error=new Error(message);error.code=code;return error;}
function validSecret(record){return record&&typeof record.value==='string'&&record.value.length>0&&typeof record.version==='string'&&/^\d+$/.test(record.version);}
function versionFromName(name){const match=String(name??'').match(/\/versions\/(\d+)$/);if(!match)throw new Error('Secret version receipt is invalid');return match[1];}
function isEnabled(version){return version?.state==='ENABLED'||version?.state===1;}
function safeReason(reason){return SAFE_REASONS.has(reason)?reason:'qbo_reconnect_required';}

export function createQuickBooksRefreshSecretStore({client,projectId,secretName='QBO_REFRESH_TOKEN',timeoutMs=DEFAULT_SECRET_TIMEOUT_MS}={}){
  if(!client?.listSecretVersions||!client?.accessSecretVersion||!client?.addSecretVersion||typeof projectId!=='string'||!projectId||!/^[A-Z0-9_]+$/.test(secretName)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>=DEFAULT_LEASE_MS)throw new TypeError('QuickBooks secret store dependencies are invalid');
  const parent=`projects/${projectId}/secrets/${secretName}`;const options={timeout:timeoutMs};
  async function readVersion(version){
    if(!/^\d+$/.test(String(version)))throw new Error('QuickBooks credential version is invalid');
    const [result]=await client.accessSecretVersion({name:`${parent}/versions/${version}`},options);
    const value=result?.payload?.data?.toString('utf8');const actual=versionFromName(result?.name);
    if(!value||actual!==String(version))throw new Error('QuickBooks credential is unavailable');return {value,version:actual};
  }
  return Object.freeze({
    async readLatestEnabled(){
      const [versions]=await client.listSecretVersions({parent,filter:'state:ENABLED',pageSize:100},options);
      const enabled=(versions??[]).filter(isEnabled).map(entry=>({entry,version:versionFromName(entry.name)}));
      if(enabled.length===0)throw new Error('QuickBooks credential is unavailable');
      enabled.sort((left,right)=>BigInt(left.version)>BigInt(right.version)?-1:BigInt(left.version)<BigInt(right.version)?1:0);
      return readVersion(enabled[0].version);
    },
    readVersion,
    async addVersion(value){if(typeof value!=='string'||!value)throw new Error('QuickBooks credential is invalid');const [result]=await client.addSecretVersion({parent,payload:{data:Buffer.from(value,'utf8')}},options);return {version:versionFromName(result?.name)};},
  });
}

export function createFirestoreQuickBooksRefreshLeaseStore({db,collectionName='integrationControl',documentId='qbo-credential-rotation',alertCollectionName='integrationAlerts'}={}){
  if(!db?.collection||!db?.runTransaction)throw new TypeError('QuickBooks lease store dependencies are invalid');
  const reference=db.collection(collectionName).doc(documentId);const alerts=db.collection(alertCollectionName);
  const alert=(transaction,reason,nowMs)=>transaction.set(alerts.doc(),{type:'qbo_rotation_operator_alert',reason:safeReason(reason),createdAtMs:nowMs});
  return Object.freeze({
    claim({ownerId,nowMs,expiresAtMs}){return db.runTransaction(async transaction=>{const snapshot=await transaction.get(reference);const current=snapshot.exists?snapshot.data():null;if(current?.status==='manual_review')return {status:'manual_review',reason:safeReason(current.reason)};if(current?.status==='claimed'&&Number(current.expiresAtMs)>nowMs){transaction.set(reference,{status:'claimed',ownerId:String(current.ownerId),expiresAtMs:Number(current.expiresAtMs),dispatchStartedAtMs:current.dispatchStartedAtMs??null,attemptCount:Number(current.attemptCount??0),lastReason:'qbo_refresh_busy',updatedAtMs:nowMs});return {status:'busy'};}if(current?.status==='claimed'&&current.dispatchStartedAtMs!=null){const reason='qbo_reconnect_required';transaction.set(reference,{status:'manual_review',reason,attemptCount:1,updatedAtMs:nowMs});alert(transaction,reason,nowMs);return {status:'manual_review',reason};}transaction.set(reference,{status:'claimed',ownerId,expiresAtMs,dispatchStartedAtMs:null,attemptCount:0,updatedAtMs:nowMs});return {status:'claimed'};});},
    markDispatchStarted({ownerId,nowMs}){return db.runTransaction(async transaction=>{const snapshot=await transaction.get(reference);const current=snapshot.exists?snapshot.data():null;if(current?.status!=='claimed'||current.ownerId!==ownerId||current.dispatchStartedAtMs!=null||current.attemptCount!==0||Number(current.expiresAtMs)<=nowMs)return false;transaction.set(reference,{status:'claimed',ownerId,expiresAtMs:Number(current.expiresAtMs),dispatchStartedAtMs:nowMs,attemptCount:1,updatedAtMs:nowMs});return true;});},
    verifyStartedOwner({ownerId}){return db.runTransaction(async transaction=>{const snapshot=await transaction.get(reference);const current=snapshot.exists?snapshot.data():null;return current?.status==='claimed'&&current.ownerId===ownerId&&current.dispatchStartedAtMs!=null&&current.attemptCount===1;});},
    complete({ownerId,receipt,nowMs}){return db.runTransaction(async transaction=>{const snapshot=await transaction.get(reference);const current=snapshot.exists?snapshot.data():null;if(current?.status!=='claimed'||current.ownerId!==ownerId||current.dispatchStartedAtMs==null||current.attemptCount!==1)return false;transaction.set(reference,{status:'idle',ownerId:null,expiresAtMs:0,dispatchStartedAtMs:null,attemptCount:0,lastReceipt:{status:'rotated',sourceVersion:String(receipt.sourceVersion),storedVersion:String(receipt.storedVersion)},updatedAtMs:nowMs});return true;});},
    failBeforeDispatch({ownerId,reason,nowMs}){return db.runTransaction(async transaction=>{const snapshot=await transaction.get(reference);const current=snapshot.exists?snapshot.data():null;if(current?.status!=='claimed'||current.ownerId!==ownerId||current.dispatchStartedAtMs!=null)return false;transaction.set(reference,{status:'idle',ownerId:null,expiresAtMs:0,dispatchStartedAtMs:null,attemptCount:0,lastReason:safeReason(reason),updatedAtMs:nowMs});return true;});},
    requireManualReview({ownerId,reason,nowMs}){return db.runTransaction(async transaction=>{const snapshot=await transaction.get(reference);const current=snapshot.exists?snapshot.data():null;if(current?.status==='manual_review')return true;if(current?.status!=='claimed'||current.ownerId!==ownerId||current.dispatchStartedAtMs==null)return false;const normalized=safeReason(reason);transaction.set(reference,{status:'manual_review',reason:normalized,attemptCount:1,updatedAtMs:nowMs});alert(transaction,normalized,nowMs);return true;});},
    resetAfterReconnect({nowMs}){return db.runTransaction(async transaction=>{transaction.set(reference,{status:'idle',ownerId:null,expiresAtMs:0,dispatchStartedAtMs:null,attemptCount:0,lastReason:'qbo_refresh_predispatch_retry',updatedAtMs:nowMs});return true;});},
  });
}

export function createQuickBooksTokenCoordinator({secretStore,leaseStore,refresh,clock=()=>new Date(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ownerIdFactory=randomUUID,leaseMs=DEFAULT_LEASE_MS,maxWaitMs=DEFAULT_WAIT_MS,crashHook=()=>{}}={}){
  if(!secretStore?.readLatestEnabled||!secretStore?.addVersion||!secretStore?.readVersion||!leaseStore?.claim||!leaseStore?.markDispatchStarted||!leaseStore?.verifyStartedOwner||!leaseStore?.complete||!leaseStore?.failBeforeDispatch||!leaseStore?.requireManualReview||typeof refresh!=='function'||!Number.isInteger(leaseMs)||leaseMs<1||leaseMs>5*60*1000)throw new TypeError('QuickBooks token coordinator dependencies are invalid');
  let cached=null;let pending=null;
  async function run(){
    const ownerId=ownerIdFactory();const began=clock().getTime();let dispatched=false;let source;
    try{
      while(true){const nowMs=clock().getTime();const claim=await leaseStore.claim({ownerId,nowMs,expiresAtMs:nowMs+leaseMs});if(claim.status==='claimed')break;if(claim.status==='manual_review')throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');if(nowMs-began>=maxWaitMs)throw publicError('QBO_REFRESH_BUSY','QuickBooks authentication is temporarily unavailable');await sleep(Math.min(250,Math.max(1,maxWaitMs-(nowMs-began))));}
      crashHook('after_claim');source=await secretStore.readLatestEnabled();if(!validSecret(source))throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');crashHook('after_source_read');
      const marked=await leaseStore.markDispatchStarted({ownerId,nowMs:clock().getTime()});if(!marked)throw publicError('QBO_REFRESH_BUSY','QuickBooks authentication is temporarily unavailable');dispatched=true;crashHook('after_dispatch_started');
      let result;try{result=await refresh(source.value);}catch(error){if(error?.code==='QBO_REFRESH_TIMEOUT')throw publicError('QBO_REFRESH_TIMEOUT','QuickBooks authentication timed out');throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');}
      if(!result||!result.accessToken||!result.refreshToken||safeEqual(result.refreshToken,source.value))throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');crashHook('after_provider_refresh');
      if(!await leaseStore.verifyStartedOwner({ownerId}))throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');
      let storedVersion;try{const added=await secretStore.addVersion(result.refreshToken);storedVersion=added.version;crashHook('after_secret_add');const exact=await secretStore.readVersion(storedVersion);if(!validSecret(exact)||exact.version!==storedVersion||!safeEqual(exact.value,result.refreshToken))throw new Error('mismatch');}catch{try{const latest=await secretStore.readLatestEnabled();if(validSecret(latest)&&safeEqual(latest.value,result.refreshToken))storedVersion=latest.version;else throw new Error('mismatch');}catch{throw publicError('QBO_REFRESH_PERSISTENCE_UNKNOWN','QuickBooks credential rotation requires operator review');}}
      const receipt={status:'rotated',sourceVersion:source.version,storedVersion};if(!await leaseStore.complete({ownerId,receipt,nowMs:clock().getTime()}))throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');const expires=Number.isFinite(result.expiresIn)?Math.max(1,result.expiresIn):300;cached={value:result.accessToken,expiresAtMs:clock().getTime()+Math.min(expires*1000,55*60*1000)};return cached.value;
    }catch(error){if(dispatched){let reason='qbo_reconnect_required';if(error?.code==='QBO_REFRESH_PERSISTENCE_UNKNOWN')reason='qbo_refresh_persistence_unknown';if(error?.code==='QBO_REFRESH_TIMEOUT')reason='qbo_refresh_timeout';await leaseStore.requireManualReview({ownerId,reason,nowMs:clock().getTime()});}else await leaseStore.failBeforeDispatch({ownerId,reason:'qbo_refresh_predispatch_retry',nowMs:clock().getTime()});throw error;}
  }
  return Object.freeze({getAccessToken(){if(cached&&cached.expiresAtMs>clock().getTime()+30_000)return Promise.resolve(cached.value);if(!pending)pending=run().finally(()=>{pending=null;});return pending;}});
}

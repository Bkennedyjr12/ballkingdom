import {timingSafeEqual,randomUUID} from 'node:crypto';

const DEFAULT_LEASE_MS = 4 * 60 * 1000;
const DEFAULT_WAIT_MS = 15 * 1000;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a,b);
}

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validSecret(record) {
  return record && typeof record.value === 'string' && record.value.length > 0
    && typeof record.version === 'string' && record.version.length > 0;
}

function validTokenResult(result, sourceToken) {
  return result && typeof result.accessToken === 'string' && result.accessToken.length > 0
    && typeof result.refreshToken === 'string' && result.refreshToken.length > 0
    && !safeEqual(result.refreshToken,sourceToken);
}

function versionFromName(name) {
  const match = String(name ?? '').match(/\/versions\/([^/]+)$/);
  if (!match || match[1] === 'latest') throw new Error('Secret version receipt is invalid');
  return match[1];
}

export function createQuickBooksRefreshSecretStore({client,projectId,secretName='QBO_REFRESH_TOKEN'} = {}) {
  if (!client?.accessSecretVersion || !client?.addSecretVersion
    || typeof projectId !== 'string' || projectId.length === 0
    || !/^[A-Z0-9_]+$/.test(secretName)) {
    throw new TypeError('QuickBooks secret store dependencies are invalid');
  }
  const parent=`projects/${projectId}/secrets/${secretName}`;
  async function read(name) {
    const [result] = await client.accessSecretVersion({name});
    const value=result?.payload?.data?.toString('utf8');
    const version=versionFromName(result?.name);
    if (typeof value !== 'string' || value.length === 0) throw new Error('QuickBooks credential is unavailable');
    return {value,version};
  }
  return Object.freeze({
    readLatest:()=>read(`${parent}/versions/latest`),
    readVersion:version=>read(`${parent}/versions/${encodeURIComponent(version)}`),
    async addVersion(value) {
      if (typeof value !== 'string' || value.length === 0) throw new Error('QuickBooks credential is invalid');
      const [result]=await client.addSecretVersion({parent,payload:{data:Buffer.from(value,'utf8')}});
      return {version:versionFromName(result?.name)};
    },
  });
}

export function createFirestoreQuickBooksRefreshLeaseStore({db,collectionName='integrationControl',documentId='qbo-credential-rotation'} = {}) {
  if (!db?.collection || !db?.runTransaction) throw new TypeError('QuickBooks lease store dependencies are invalid');
  const reference=db.collection(collectionName).doc(documentId);
  return Object.freeze({
    acquire({ownerId,nowMs,expiresAtMs}) {
      return db.runTransaction(async transaction=>{
        const snapshot=await transaction.get(reference);
        const current=snapshot.exists ? snapshot.data() : null;
        if (current?.ownerId && current.ownerId !== ownerId && Number(current.expiresAtMs) > nowMs) return false;
        transaction.set(reference,{ownerId,expiresAtMs});
        return true;
      });
    },
    release({ownerId,receipt}) {
      return db.runTransaction(async transaction=>{
        const snapshot=await transaction.get(reference);
        const current=snapshot.exists ? snapshot.data() : null;
        if (current?.ownerId !== ownerId) return false;
        const safeReceipt={status:String(receipt?.status ?? 'failed')};
        if (receipt?.sourceVersion) safeReceipt.sourceVersion=String(receipt.sourceVersion);
        if (receipt?.storedVersion) safeReceipt.storedVersion=String(receipt.storedVersion);
        transaction.set(reference,{ownerId:null,expiresAtMs:0,lastReceipt:safeReceipt});
        return true;
      });
    },
  });
}

export function createQuickBooksTokenCoordinator({
  secretStore,leaseStore,refresh,clock = () => new Date(),sleep = ms => new Promise(resolve=>setTimeout(resolve,ms)),
  ownerIdFactory = randomUUID,leaseMs = DEFAULT_LEASE_MS,maxWaitMs = DEFAULT_WAIT_MS,
} = {}) {
  if (!secretStore?.readLatest || !secretStore?.addVersion || !leaseStore?.acquire
    || !leaseStore?.release || typeof refresh !== 'function'
    || !Number.isInteger(leaseMs) || leaseMs < 1 || leaseMs > 5 * 60 * 1000) {
    throw new TypeError('QuickBooks token coordinator dependencies are invalid');
  }
  let cached = null;
  let pending = null;

  async function persistAndVerify(rotatedToken) {
    try {
      const added = await secretStore.addVersion(rotatedToken);
      if (!added || typeof added.version !== 'string' || added.version.length === 0) {
        throw new Error('missing version receipt');
      }
      const exact = secretStore.readVersion ? await secretStore.readVersion(added.version) : await secretStore.readLatest();
      if (!validSecret(exact) || exact.version !== added.version || !safeEqual(exact.value,rotatedToken)) {
        throw new Error('version readback mismatch');
      }
      return added.version;
    } catch {
      try {
        const latest = await secretStore.readLatest();
        if (validSecret(latest) && safeEqual(latest.value,rotatedToken)) return latest.version;
      } catch {
        // The public failure below is deliberately redacted.
      }
      throw publicError('QBO_TOKEN_PERSISTENCE_REVIEW','QuickBooks credential rotation requires operator review');
    }
  }

  async function run() {
    const ownerId = ownerIdFactory();
    const startedAt = clock().getTime();
    let acquired = false;
    while (!acquired) {
      const nowMs = clock().getTime();
      acquired = await leaseStore.acquire({ownerId,nowMs,expiresAtMs:nowMs + leaseMs});
      if (acquired) break;
      if (nowMs - startedAt >= maxWaitMs) {
        throw publicError('QBO_REFRESH_BUSY','QuickBooks authentication is temporarily unavailable');
      }
      await sleep(Math.min(250,Math.max(1,maxWaitMs - (nowMs-startedAt))));
    }

    let receipt = {status:'failed'};
    try {
      const source = await secretStore.readLatest();
      if (!validSecret(source)) throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');
      let tokenResult;
      try {
        tokenResult = await refresh(source.value);
      } catch (error) {
        if (error?.code === 'invalid_grant') {
          throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');
        }
        throw publicError('QBO_AUTH_FAILED','QuickBooks authentication could not be completed');
      }
      if (!validTokenResult(tokenResult,source.value)) {
        throw publicError('QBO_RECONNECT_REQUIRED','QuickBooks must be reconnected');
      }
      const storedVersion = await persistAndVerify(tokenResult.refreshToken);
      receipt = {status:'rotated',sourceVersion:source.version,storedVersion};
      const expiresIn = Number.isFinite(tokenResult.expiresIn) ? Math.max(1,tokenResult.expiresIn) : 300;
      cached = {value:tokenResult.accessToken,expiresAtMs:clock().getTime() + Math.min(expiresIn * 1000,55 * 60 * 1000)};
      return cached.value;
    } finally {
      await leaseStore.release({ownerId,receipt});
    }
  }

  return Object.freeze({
    getAccessToken() {
      if (cached && cached.expiresAtMs > clock().getTime() + 30_000) return Promise.resolve(cached.value);
      if (!pending) pending = run().finally(()=>{pending=null;});
      return pending;
    },
  });
}

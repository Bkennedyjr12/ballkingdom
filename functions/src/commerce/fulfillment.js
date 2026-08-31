import {createHash, randomBytes as secureRandomBytes} from 'node:crypto';

const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const GRANT_NONCE = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const GENERATION = /^[1-9][0-9]{0,30}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MD5_BASE64 = /^[A-Za-z0-9+/]{22}==$/;
const TEN_MINUTES_MS = 10 * 60 * 1000;

function fulfillmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireAuth(authContext) {
  if (!authContext?.app) throw fulfillmentError('APP_CHECK_REQUIRED', 'App Check is required');
  const uid = authContext.auth?.uid;
  if (typeof uid !== 'string' || uid.length < 1 || uid.length > 128
    || /[\u0000-\u001f\u007f]/.test(uid)) {
    throw fulfillmentError('AUTH_REQUIRED', 'Authentication is required');
  }
  return uid;
}

function requireOrderId(input) {
  if (!isRecord(input) || typeof input.orderId !== 'string' || !ORDER_ID.test(input.orderId)) {
    throw fulfillmentError('FULFILLMENT_INPUT_INVALID', 'Fulfillment request is invalid');
  }
  return input.orderId;
}

function artifactDefinitionFor(artifactKeys, sku) {
  const definition = artifactKeys[sku];
  const key = definition?.key;
  if (typeof key !== 'string' || key.length < 1 || key.length > 512
    || key.startsWith('/') || key.includes('\\')
    || key.split('/').some(segment => !segment || segment === '.' || segment === '..')
    || typeof definition.contentType !== 'string' || definition.contentType.length > 127
    || !MIME_TYPE.test(definition.contentType)
    || !Number.isSafeInteger(definition.exactBytes) || definition.exactBytes < 1
    || typeof definition.generation !== 'string' || !GENERATION.test(definition.generation)
    || typeof definition.sha256 !== 'string' || !SHA256.test(definition.sha256)
    || typeof definition.md5Hash !== 'string' || !MD5_BASE64.test(definition.md5Hash)) {
    throw fulfillmentError('FULFILLMENT_NOT_AVAILABLE', 'Digital fulfillment is not available');
  }
  return Object.freeze({
    key,contentType:definition.contentType,exactBytes:definition.exactBytes,
    generation:definition.generation,sha256:definition.sha256,md5Hash:definition.md5Hash,
  });
}

function requireOwnedFulfillment(order, entitlement, uid, artifactKeys) {
  if (!order || order.customerUid !== uid) {
    throw fulfillmentError('FULFILLMENT_NOT_FOUND', 'Digital fulfillment was not found');
  }
  if (order.status !== 'fulfilled'
    || order.orderType !== 'digital_product'
    || order.fulfillmentType !== 'protected_download'
    || entitlement?.orderId !== order.id
    || entitlement?.status !== 'active'
    || entitlement?.customerUid !== uid
    || entitlement?.sku !== order.sku) {
    throw fulfillmentError('FULFILLMENT_NOT_AVAILABLE', 'Digital fulfillment is not available');
  }
  return artifactDefinitionFor(artifactKeys, order.sku);
}

export function createFulfillmentService({
  repository,
  artifactKeys = Object.freeze({}),
  randomBytes = secureRandomBytes,
  clock = () => new Date(),
  streamArtifact,
  grantTtlMs = TEN_MINUTES_MS,
} = {}) {
  if (!repository?.getOrder || !repository?.getEntitlement
    || !repository?.createDownloadGrant || !repository?.consumeDownloadGrant
    || typeof randomBytes !== 'function' || typeof clock !== 'function'
    || typeof streamArtifact !== 'function' || !isRecord(artifactKeys)
    || grantTtlMs !== TEN_MINUTES_MS) {
    throw new TypeError('Fulfillment dependencies are required');
  }
  const allowlist = Object.freeze({...artifactKeys});

  async function loadOwned(orderId, uid) {
    const [order, entitlement] = await Promise.all([
      repository.getOrder(orderId), repository.getEntitlement(orderId),
    ]);
    const artifact = requireOwnedFulfillment(order, entitlement, uid, allowlist);
    return {order,artifact};
  }

  return Object.freeze({
    async fulfillPaidOrder(order) {
      if (!isRecord(order) || !ORDER_ID.test(String(order.id ?? ''))
        || order.status !== 'paid' || order.orderType !== 'digital_product'
        || order.fulfillmentType !== 'protected_download'
        || typeof order.customerUid !== 'string' || order.customerUid.length < 1) {
        throw fulfillmentError('FULFILLMENT_NOT_ELIGIBLE', 'Order is not eligible for fulfillment');
      }
      artifactDefinitionFor(allowlist, order.sku);
      if (typeof repository.activateEntitlement !== 'function') {
        throw fulfillmentError('FULFILLMENT_CONFIGURATION_INVALID', 'Fulfillment is unavailable');
      }
      return repository.activateEntitlement(Object.freeze({
        orderId:order.id,sku:order.sku,customerUid:order.customerUid,
        fulfillmentType:'protected_download',status:'active',
      }));
    },

    async createDownloadGrant(input, authContext) {
      const uid = requireAuth(authContext);
      const orderId = requireOrderId(input);
      const {order} = await loadOwned(orderId, uid);
      const nonceBytes = randomBytes(32);
      if (!Buffer.isBuffer(nonceBytes) || nonceBytes.byteLength !== 32) {
        throw fulfillmentError('FULFILLMENT_CONFIGURATION_INVALID', 'Fulfillment is unavailable');
      }
      const grant = nonceBytes.toString('base64url');
      const issuedAt = new Date(clock());
      if (Number.isNaN(issuedAt.getTime())) {
        throw fulfillmentError('FULFILLMENT_CONFIGURATION_INVALID', 'Fulfillment is unavailable');
      }
      const digest = createHash('sha256').update(grant).digest('hex');
      await repository.createDownloadGrant(Object.freeze({
        orderId,digest,customerUid:uid,sku:order.sku,issuedAt,
        expiresAt:new Date(issuedAt.getTime() + TEN_MINUTES_MS),consumedAt:null,
      }));
      return Object.freeze({grant,expiresAt:new Date(issuedAt.getTime() + TEN_MINUTES_MS)});
    },

    async redeemDownloadGrant(input, authContext) {
      const uid = requireAuth(authContext);
      const orderId = requireOrderId(input);
      if (Object.hasOwn(input, 'storagePath')
        || typeof input.grant !== 'string' || !GRANT_NONCE.test(input.grant)) {
        throw fulfillmentError('FULFILLMENT_INPUT_INVALID', 'Fulfillment request is invalid');
      }
      const {order,artifact} = await loadOwned(orderId, uid);
      const digest = createHash('sha256').update(input.grant).digest('hex');
      if (!DIGEST.test(digest)) throw fulfillmentError('FULFILLMENT_INPUT_INVALID', 'Fulfillment request is invalid');
      const now = new Date(clock());
      const consumed = await repository.consumeDownloadGrant({
        orderId,digest,customerUid:uid,sku:order.sku,now,
      });
      if (!consumed) {
        throw fulfillmentError('FULFILLMENT_GRANT_INVALID', 'Download grant is invalid or expired');
      }
      const result = await streamArtifact(
        artifact.key,Object.freeze({
          orderId,sku:order.sku,customerUid:uid,response:authContext.response,
          expectedContentType:artifact.contentType,exactBytes:artifact.exactBytes,
          expectedGeneration:artifact.generation,expectedMd5Hash:artifact.md5Hash,
        })
      );
      if (!isRecord(result) || result.streamed !== true
        || Object.keys(result).some(key => !['streamed','contentType','bytesWritten'].includes(key))
        || result.contentType !== artifact.contentType
        || result.bytesWritten !== artifact.exactBytes) {
        throw fulfillmentError(
          'FULFILLMENT_STREAM_INVALID','Artifact streaming contract was not satisfied'
        );
      }
      return Object.freeze({...result});
    },
  });
}

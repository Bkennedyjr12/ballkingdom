const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TEN_MINUTES_MS = 10 * 60 * 1000;

function repositoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validId(value, pattern = ID) {
  return typeof value === 'string' && pattern.test(value);
}

function dateValue(value) {
  if (value instanceof Date) return new Date(value);
  if (typeof value?.toDate === 'function') return value.toDate();
  return new Date(Number.NaN);
}

function validateGrant(grant) {
  const issuedAt = dateValue(grant?.issuedAt);
  const expiresAt = dateValue(grant?.expiresAt);
  if (!validId(grant?.orderId) || !validId(grant?.digest, DIGEST)
    || !validId(grant?.customerUid) || !validId(grant?.sku, SKU)
    || grant?.consumedAt !== null || Number.isNaN(issuedAt.getTime())
    || Number.isNaN(expiresAt.getTime())
    || expiresAt.getTime() - issuedAt.getTime() !== TEN_MINUTES_MS) {
    throw repositoryError('FULFILLMENT_GRANT_INVALID', 'Download grant is invalid');
  }
  return {issuedAt,expiresAt};
}

function exactEntitlement(order, entitlement, {orderId,customerUid,sku}) {
  return order?.id === orderId && order.status === 'fulfilled'
    && order.orderType === 'digital_product' && order.fulfillmentType === 'protected_download'
    && order.customerUid === customerUid && order.sku === sku
    && entitlement?.orderId === orderId && entitlement.status === 'active'
    && entitlement.customerUid === customerUid && entitlement.sku === sku
    && entitlement.fulfillmentType === 'protected_download';
}

export function createFulfillmentRepository({db,fieldValue,Timestamp} = {}) {
  if (!db?.collection || !db?.runTransaction || !fieldValue?.serverTimestamp
    || !Timestamp?.fromDate) throw new TypeError('Fulfillment repository dependencies are required');
  const orders = db.collection('orders');
  const entitlements = db.collection('fulfillmentGrants');
  const refs = (orderId,digest) => {
    const order = orders.doc(orderId);
    const entitlement = entitlements.doc(orderId);
    return {
      order,entitlement,
      grant:digest ? entitlement.collection('downloadGrants').doc(digest) : null,
    };
  };

  return Object.freeze({
    async getOrder(orderId) {
      if (!validId(orderId)) return null;
      const snapshot = await orders.doc(orderId).get();
      return snapshot.exists ? {id:orderId,...snapshot.data()} : null;
    },

    async getEntitlement(orderId) {
      if (!validId(orderId)) return null;
      const snapshot = await entitlements.doc(orderId).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async createDownloadGrant(grant) {
      const {issuedAt,expiresAt} = validateGrant(grant);
      const {order,entitlement,grant:grantRef} = refs(grant.orderId,grant.digest);
      return db.runTransaction(async transaction => {
        const [orderSnapshot,entitlementSnapshot,existing] = await Promise.all([
          transaction.get(order),transaction.get(entitlement),transaction.get(grantRef),
        ]);
        if (existing.exists) throw repositoryError('FULFILLMENT_GRANT_CONFLICT', 'Download grant already exists');
        if (!orderSnapshot.exists || !entitlementSnapshot.exists
          || !exactEntitlement({id:grant.orderId,...orderSnapshot.data()}, entitlementSnapshot.data(), grant)) {
          throw repositoryError('FULFILLMENT_NOT_ALLOWED', 'Download grant is not allowed');
        }
        transaction.create(grantRef, {
          orderId:grant.orderId,digest:grant.digest,customerUid:grant.customerUid,sku:grant.sku,
          issuedAt:Timestamp.fromDate(issuedAt),expiresAt:Timestamp.fromDate(expiresAt),consumedAt:null,
        });
        return true;
      });
    },

    async consumeDownloadGrant({orderId,digest,customerUid,sku,now} = {}) {
      const at = dateValue(now);
      if (!validId(orderId) || !validId(digest, DIGEST) || !validId(customerUid)
        || !validId(sku, SKU) || Number.isNaN(at.getTime())) {
        throw repositoryError('FULFILLMENT_GRANT_INVALID', 'Download grant is invalid');
      }
      const {order,entitlement,grant} = refs(orderId,digest);
      return db.runTransaction(async transaction => {
        const [orderSnapshot,entitlementSnapshot,grantSnapshot] = await Promise.all([
          transaction.get(order),transaction.get(entitlement),transaction.get(grant),
        ]);
        if (!orderSnapshot.exists || !entitlementSnapshot.exists || !grantSnapshot.exists) return null;
        const stored = grantSnapshot.data();
        const expiresAt = dateValue(stored.expiresAt);
        if (!exactEntitlement({id:orderId,...orderSnapshot.data()}, entitlementSnapshot.data(), {
          orderId,customerUid,sku,
        }) || stored.orderId !== orderId || stored.digest !== digest
          || stored.customerUid !== customerUid || stored.sku !== sku
          || stored.consumedAt != null || Number.isNaN(expiresAt.getTime())
          || at.getTime() >= expiresAt.getTime()) return null;
        transaction.update(grant, {consumedAt:Timestamp.fromDate(at)});
        return Object.freeze({orderId,digest,customerUid,sku,consumedAt:at});
      });
    },
  });
}

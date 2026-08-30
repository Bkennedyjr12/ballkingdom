import {createHash} from 'node:crypto';
import {FieldValue, Timestamp as FirestoreTimestamp} from 'firebase-admin/firestore';

const ORDER_STATUSES = new Set([
  'created',
  'pending_payment',
  'payment_verifying',
  'pending_invoice_approval',
  'invoice_processing',
  'invoiced',
  'paid',
  'fulfilling',
  'fulfilled',
  'cancelled',
  'refunded',
  'manual_review',
]);
const TERMINAL_STATUSES = new Set(['fulfilled', 'cancelled', 'refunded', 'manual_review']);
const FINAL_STATUSES = new Set(['cancelled', 'refunded']);
const ALLOWED_TRANSITIONS = Object.freeze({
  created: new Set(['pending_payment', 'pending_invoice_approval', 'cancelled']),
  pending_payment: new Set(['payment_verifying', 'manual_review', 'cancelled']),
  payment_verifying: new Set(['paid', 'pending_payment', 'manual_review', 'cancelled']),
  pending_invoice_approval: new Set(['invoice_processing', 'cancelled']),
  invoice_processing: new Set(['invoiced', 'pending_invoice_approval']),
  invoiced: new Set(['payment_verifying', 'cancelled']),
  paid: new Set(['fulfilling', 'refunded']),
  fulfilling: new Set(['fulfilled', 'paid', 'refunded']),
  fulfilled: new Set(['refunded']),
  manual_review: new Set(['cancelled', 'refunded']),
  cancelled: new Set(),
  refunded: new Set(),
});
const UNSAFE_PROVIDER_KEY = /token|card|bank|accountNumber|payload/i;
const PROVIDER_KEY = /^[a-z][A-Za-z0-9]{1,63}(?:Id|Ref|Reference)$/;
const PROVIDER_VALUE = /^[A-Za-z0-9._:/-]{1,200}$/;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const SAFE_ERROR_CODE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function repositoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredId(value, fieldName, pattern = DOCUMENT_ID) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw repositoryError('ORDER_INVALID', `${fieldName} is invalid`);
  }
  return value;
}

function requiredText(value, fieldName, maximum = 200) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value !== value.trim()) {
    throw repositoryError('ORDER_INVALID', `${fieldName} is invalid`);
  }
  return value;
}

function plainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeProviderRefs(value) {
  if (value == null) return Object.freeze({});
  if (!plainObject(value) || Object.keys(value).length > 16) {
    throw repositoryError('UNSAFE_PROVIDER_REFS', 'Provider references are invalid');
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  for (const [key, reference] of entries) {
    if (UNSAFE_PROVIDER_KEY.test(key) || !PROVIDER_KEY.test(key)
      || typeof reference !== 'string' || !PROVIDER_VALUE.test(reference)) {
      throw repositoryError('UNSAFE_PROVIDER_REFS', 'Provider references are invalid');
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

function normalizeCustomer(value) {
  if (!plainObject(value)) throw repositoryError('ORDER_INVALID', 'customer is invalid');
  const customer = {name: requiredText(value.name, 'customer.name')};
  if (value.email != null) customer.email = requiredText(value.email, 'customer.email', 320);
  return Object.freeze(customer);
}

function normalizeOrder(order) {
  if (!plainObject(order)) throw repositoryError('ORDER_INVALID', 'order is invalid');
  const status = requiredText(order.status, 'status', 64);
  if (!ORDER_STATUSES.has(status)) throw repositoryError('ORDER_INVALID', 'status is invalid');
  if (!Number.isInteger(order.amountCents) || order.amountCents <= 0) {
    throw repositoryError('ORDER_INVALID', 'amountCents is invalid');
  }
  const currency = requiredText(order.currency, 'currency', 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw repositoryError('ORDER_INVALID', 'currency is invalid');
  const orderType = requiredText(order.orderType, 'orderType', 64);
  if (!['digital_product', 'service'].includes(orderType)) {
    throw repositoryError('ORDER_INVALID', 'orderType is invalid');
  }
  const provider = order.provider == null ? 'quickbooks' : requiredText(order.provider, 'provider', 32);
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(provider)) {
    throw repositoryError('ORDER_INVALID', 'provider is invalid');
  }

  return Object.freeze({
    sku: requiredText(order.sku, 'sku', 128),
    name: requiredText(order.name, 'name'),
    amountCents: order.amountCents,
    currency,
    orderType,
    fulfillmentType: requiredText(order.fulfillmentType, 'fulfillmentType', 64),
    customer: normalizeCustomer(order.customer),
    status,
    provider,
    providerRefs: normalizeProviderRefs(order.providerRefs),
  });
}

function fingerprint(order) {
  return createHash('sha256').update(JSON.stringify(order)).digest('hex');
}

function dateValue(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw repositoryError('ORDER_INVALID', `${fieldName} is invalid`);
  return date;
}

function auditReceipt(fields, fieldValue) {
  const allowed = [
    'orderId',
    'event',
    'fromStatus',
    'toStatus',
    'workerId',
    'errorCode',
  ];
  return Object.fromEntries([
    ...allowed.filter(key => fields[key] != null).map(key => [key, fields[key]]),
    ['createdAt', fieldValue.serverTimestamp()],
  ]);
}

export function createOrderRepository({
  db,
  fieldValue = FieldValue,
  Timestamp = FirestoreTimestamp,
  clock = () => new Date(),
} = {}) {
  if (!db?.collection || !db?.runTransaction) {
    throw new TypeError('Firestore db is required');
  }
  if (!fieldValue?.serverTimestamp || !Timestamp?.fromDate || typeof clock !== 'function') {
    throw new TypeError('Firestore timestamp dependencies are required');
  }

  const orders = db.collection('orders');
  const audits = db.collection('commerceAudit');
  const orderRef = orderId => orders.doc(requiredId(orderId, 'orderId'));
  const auditRef = () => audits.doc();

  function matchingClaim(order, transition, workerId) {
    return order.activeTransition?.transition === transition
      && order.activeTransition?.workerId === workerId;
  }

  return Object.freeze({
    async createOrder(orderId, rawOrder) {
      const id = requiredId(orderId, 'orderId');
      const order = normalizeOrder(rawOrder);
      const idempotencyKey = `bk-order-${id}`;
      const idempotencyFingerprint = fingerprint(order);
      const reference = orderRef(id);
      const receipt = auditRef();

      return db.runTransaction(async transaction => {
        const existing = await transaction.get(reference);
        if (existing.exists) {
          if (existing.data().idempotencyKey !== idempotencyKey
            || existing.data().idempotencyFingerprint !== idempotencyFingerprint) {
            throw repositoryError(
              'ORDER_IDEMPOTENCY_CONFLICT',
              'Order idempotency key was reused with different data'
            );
          }
          return {orderId: id, idempotencyKey, duplicate: true};
        }

        const reconciliationDueAt = Timestamp.fromDate(dateValue(clock(), 'clock'));
        const timestamp = fieldValue.serverTimestamp();
        transaction.create(reference, {
          ...order,
          fulfillment: {status: 'locked'},
          idempotencyKey,
          idempotencyFingerprint,
          activeTransition: null,
          revision: 0,
          terminal: TERMINAL_STATUSES.has(order.status),
          reconciliationDueAt,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'order_created',
          toStatus: order.status,
        }, fieldValue));
        return {orderId: id, idempotencyKey, duplicate: false};
      });
    },

    async getOrder(orderId) {
      const reference = orderRef(orderId);
      const snapshot = await reference.get();
      return snapshot.exists ? {id: snapshot.id, ...snapshot.data()} : null;
    },

    async claimTransition(orderId, transition, workerId) {
      const id = requiredId(orderId, 'orderId');
      const nextStatus = requiredText(transition, 'transition', 64);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      if (!ORDER_STATUSES.has(nextStatus)) {
        throw repositoryError('ORDER_INVALID', 'transition is invalid');
      }
      const reference = orderRef(id);
      const receipt = auditRef();

      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        if (order.activeTransition != null || order.status === nextStatus
          || FINAL_STATUSES.has(order.status)) {
          return false;
        }
        if (!ALLOWED_TRANSITIONS[order.status]?.has(nextStatus)) {
          throw repositoryError('INVALID_ORDER_TRANSITION', 'Order transition is invalid');
        }
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...order,
          status: nextStatus,
          terminal: TERMINAL_STATUSES.has(nextStatus),
          activeTransition: {
            transition: nextStatus,
            previousStatus: order.status,
            workerId: worker,
            claimedAt: timestamp,
          },
          revision: Number(order.revision ?? 0) + 1,
          updatedAt: timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'transition_claimed',
          fromStatus: order.status,
          toStatus: nextStatus,
          workerId: worker,
        }, fieldValue));
        return true;
      });
    },

    async completeTransition(orderId, transition, workerId, result = {}) {
      const id = requiredId(orderId, 'orderId');
      const nextStatus = requiredText(transition, 'transition', 64);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const providerRefs = normalizeProviderRefs(result.providerRefs);
      const reference = orderRef(id);
      const receipt = auditRef();

      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        if (!matchingClaim(order, nextStatus, worker)) {
          if (order.activeTransition == null
            && order.lastTransition?.transition === nextStatus
            && order.lastTransition?.workerId === worker) return false;
          throw repositoryError('TRANSITION_CLAIM_LOST', 'Transition claim is no longer held');
        }
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...order,
          providerRefs: {...(order.providerRefs ?? {}), ...providerRefs},
          activeTransition: null,
          lastTransition: {
            transition: nextStatus,
            workerId: worker,
            completedAt: timestamp,
          },
          updatedAt: timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'transition_completed',
          toStatus: nextStatus,
          workerId: worker,
        }, fieldValue));
        return true;
      });
    },

    async recordFailure(orderId, transition, workerId, failure = {}) {
      const id = requiredId(orderId, 'orderId');
      const nextStatus = requiredText(transition, 'transition', 64);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const errorCode = typeof failure.code === 'string' && SAFE_ERROR_CODE.test(failure.code)
        ? failure.code
        : 'operation_failed';
      const retryAt = Timestamp.fromDate(dateValue(failure.retryAt ?? clock(), 'retryAt'));
      const reference = orderRef(id);
      const receipt = auditRef();

      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        if (!matchingClaim(order, nextStatus, worker)) {
          throw repositoryError('TRANSITION_CLAIM_LOST', 'Transition claim is no longer held');
        }
        const restoredStatus = order.activeTransition.previousStatus;
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...order,
          status: restoredStatus,
          terminal: TERMINAL_STATUSES.has(restoredStatus),
          activeTransition: null,
          lastErrorCode: errorCode,
          reconciliationDueAt: retryAt,
          updatedAt: timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'transition_failed',
          fromStatus: nextStatus,
          toStatus: restoredStatus,
          workerId: worker,
          errorCode,
        }, fieldValue));
        return true;
      });
    },

    async listReconciliationCandidates(cutoff, {limit = 50} = {}) {
      const maximum = Number(limit);
      if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100) {
        throw repositoryError('ORDER_INVALID', 'limit is invalid');
      }
      const due = Timestamp.fromDate(dateValue(cutoff, 'cutoff'));
      const snapshot = await orders
        .where('terminal', '==', false)
        .where('reconciliationDueAt', '<=', due)
        .orderBy('reconciliationDueAt', 'asc')
        .limit(maximum)
        .get();
      return snapshot.docs.map(document => ({id: document.id, ...document.data()}));
    },
  });
}

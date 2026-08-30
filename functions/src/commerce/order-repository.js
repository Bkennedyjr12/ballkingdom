import {createHash, randomUUID} from 'node:crypto';
import {FieldValue, Timestamp as FirestoreTimestamp} from 'firebase-admin/firestore';
import {
  isAllowedOrderStatusTransition,
  isFinalOrderStatus,
  isOrderStatus,
  isReconciliationTerminalStatus,
} from './order-state.js';

const UNSAFE_PROVIDER_KEY = /token|card|bank|accountNumber|payload|secret|credential/i;
const ALLOWED_PROVIDER_KEYS = new Set([
  'realmId',
  'providerPaymentRef',
  'providerOrderRef',
  'invoiceId',
  'customerId',
]);
const PROVIDER_VALUE = /^[A-Za-z0-9._:/-]{1,200}$/;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const SAFE_ERROR_CODE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SHA256_DIGEST = /^[a-f0-9]{64}$/;
const EFFECT_TYPES = new Set(['invoice_create', 'invoice_send']);
const EFFECT_LEASE_MILLISECONDS = 5 * 60 * 1000;
const WEBHOOK_ENTITY = new Set(['Invoice', 'Payment']);
const WEBHOOK_OPERATION = new Set(['Create', 'Update', 'Delete', 'Merge', 'Void']);
const RATE_LIMIT_SCOPE = new Set(['pilot_auth', 'order_status']);

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
    if (UNSAFE_PROVIDER_KEY.test(key) || !ALLOWED_PROVIDER_KEYS.has(key)
      || typeof reference !== 'string' || !PROVIDER_VALUE.test(reference)) {
      throw repositoryError('UNSAFE_PROVIDER_REFS', 'Provider references are invalid');
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

function mergeProviderRefs(existing, incoming) {
  const current = normalizeProviderRefs(existing);
  for (const [key, value] of Object.entries(incoming)) {
    if (Object.hasOwn(current, key) && current[key] !== value) {
      throw repositoryError('PROVIDER_REF_CONFLICT', 'Provider reference cannot be changed');
    }
  }
  return {...current, ...incoming};
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
  if (!isOrderStatus(status)) throw repositoryError('ORDER_INVALID', 'status is invalid');
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

  const normalized = {
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
  };
  if (order.customerUid != null) {
    normalized.customerUid = requiredId(order.customerUid, 'customerUid', WORKER_ID);
  }
  return Object.freeze(normalized);
}

function fingerprint(order) {
  return createHash('sha256').update(JSON.stringify(order)).digest('hex');
}

function dateValue(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw repositoryError('ORDER_INVALID', `${fieldName} is invalid`);
  return date;
}

function timestampDate(value, fieldName) {
  if (value?.toDate instanceof Function) return dateValue(value.toDate(), fieldName);
  return dateValue(value, fieldName);
}

function safeErrorCode(value, fallback = 'operation_failed') {
  return typeof value === 'string' && SAFE_ERROR_CODE.test(value) ? value : fallback;
}

function recipientBinding(value) {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) {
    throw repositoryError('ORDER_INVALID', 'recipient binding is invalid');
  }
  return value;
}

function digestId(domain, ...parts) {
  const hash = createHash('sha256').update(`${domain}\0`);
  for (const part of parts) hash.update(`${part}\0`);
  return hash.digest('hex');
}

function effectType(value) {
  const normalized = requiredText(value, 'effect', 64);
  if (!EFFECT_TYPES.has(normalized)) throw repositoryError('ORDER_INVALID', 'effect is invalid');
  return normalized;
}

function effectClaimMatches(effect, workerId, claimId) {
  return effect.status === 'claimed'
    && effect.claim?.workerId === workerId
    && effect.claim?.claimId === claimId;
}

function effectReceipt(fields, fieldValue) {
  const allowed = ['orderId', 'event', 'effect', 'workerId', 'claimId', 'errorCode'];
  return Object.fromEntries([
    ...allowed.filter(key => fields[key] != null).map(key => [key, fields[key]]),
    ['createdAt', fieldValue.serverTimestamp()],
  ]);
}

function auditReceipt(fields, fieldValue) {
  const allowed = [
    'orderId',
    'event',
    'fromStatus',
    'toStatus',
    'workerId',
    'claimId',
    'revision',
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
  claimIdFactory = randomUUID,
} = {}) {
  if (!db?.collection || !db?.runTransaction) {
    throw new TypeError('Firestore db is required');
  }
  if (!fieldValue?.serverTimestamp || !Timestamp?.fromDate || typeof clock !== 'function'
    || typeof claimIdFactory !== 'function') {
    throw new TypeError('Firestore timestamp dependencies are required');
  }

  const orders = db.collection('orders');
  const audits = db.collection('commerceAudit');
  const effects = db.collection('commerceEffects');
  const reservations = db.collection('commerceReservations');
  const webhookHints = db.collection('commerceWebhookHints');
  const fulfillmentGrants = db.collection('fulfillmentGrants');
  const rateLimits = db.collection('commerceRateLimits');
  const orderRef = orderId => orders.doc(requiredId(orderId, 'orderId'));
  const auditRef = () => audits.doc();
  const effectRef = (orderId, effect) => effects.doc(`${requiredId(orderId, 'orderId')}-${effectType(effect)}`);
  const pilotAuthRef = binding => effects.doc(`pilot-auth-${recipientBinding(binding)}`);

  function orderDocument(order, id) {
    const reconciliationDueAt = Timestamp.fromDate(dateValue(clock(), 'clock'));
    const timestamp = fieldValue.serverTimestamp();
    return {
      ...order,
      fulfillment: {status: 'locked'},
      idempotencyKey: `bk-order-${id}`,
      idempotencyFingerprint: fingerprint(order),
      activeTransition: null,
      revision: 0,
      terminal: isReconciliationTerminalStatus(order.status),
      reconciliationDueAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function pendingEffect(orderId, effect) {
    const timestamp = fieldValue.serverTimestamp();
    return {
      orderId,
      effect,
      status: 'pending',
      claim: null,
      dispatchStartedAt: null,
      dispatchAttemptCount: 0,
      attemptCount: 0,
      lastErrorCode: null,
      nextAttemptAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function matchingClaim(order, transition, workerId, claimId) {
    return order.activeTransition?.transition === transition
      && order.activeTransition?.workerId === workerId
      && order.activeTransition?.claimId === claimId;
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

        transaction.create(reference, orderDocument(order, id));
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

    async getEffect(orderId, rawEffect) {
      const snapshot = await effectRef(orderId, rawEffect).get();
      return snapshot.exists ? {id:snapshot.id,...snapshot.data()} : null;
    },

    async storeWebhookHint(rawHintId, hint) {
      const hintId = recipientBinding(rawHintId);
      const keys = ['realmId','entityName','entityId','operation','lastUpdated'];
      if (!plainObject(hint)
        || Object.keys(hint).sort().join(',') !== keys.sort().join(',')
        || typeof hint.realmId !== 'string' || !PROVIDER_VALUE.test(hint.realmId)
        || !WEBHOOK_ENTITY.has(hint.entityName)
        || typeof hint.entityId !== 'string' || !PROVIDER_VALUE.test(hint.entityId)
        || !WEBHOOK_OPERATION.has(hint.operation)
        || typeof hint.lastUpdated !== 'string' || Number.isNaN(Date.parse(hint.lastUpdated))) {
        throw repositoryError('ORDER_INVALID', 'Webhook hint is invalid');
      }
      const reference = webhookHints.doc(hintId);
      return db.runTransaction(async transaction => {
        const existing = await transaction.get(reference);
        if (existing.exists) return false;
        transaction.create(reference, Object.freeze({...hint}));
        return true;
      });
    },

    async grantDigitalFulfillment(orderId) {
      const id = requiredId(orderId, 'orderId');
      const reference = fulfillmentGrants.doc(id);
      const orderReference = orderRef(id);
      return db.runTransaction(async transaction => {
        const [existing, orderSnapshot] = await Promise.all([
          transaction.get(reference), transaction.get(orderReference),
        ]);
        if (existing.exists) return false;
        if (!orderSnapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = orderSnapshot.data();
        if (order.orderType !== 'digital_product'
          || !['paid','fulfilling'].includes(order.status)
          || typeof order.customerUid !== 'string') {
          throw repositoryError('INVALID_ORDER_TRANSITION', 'Fulfillment grant is not allowed');
        }
        transaction.create(reference, {
          orderId:id,
          sku:order.sku,
          customerUid:order.customerUid,
          fulfillmentType:order.fulfillmentType,
          status:'active',
          createdAt:fieldValue.serverTimestamp(),
        });
        return true;
      });
    },

    async consumeRateLimit(scope, rawKey, now = clock(), {limit, windowMs} = {}) {
      if (!RATE_LIMIT_SCOPE.has(scope) || typeof rawKey !== 'string' || !SHA256_DIGEST.test(rawKey)
        || !Number.isInteger(limit) || limit < 1 || limit > 100
        || !Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 24 * 60 * 60 * 1000) {
        throw repositoryError('ORDER_INVALID', 'Rate limit input is invalid');
      }
      const at = dateValue(now, 'now');
      const reference = rateLimits.doc(`${scope}-${rawKey}`);
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        const currentWindow = current?.windowStartedAt
          ? timestampDate(current.windowStartedAt, 'windowStartedAt')
          : null;
        const expired = !currentWindow || at.getTime() - currentWindow.getTime() >= windowMs;
        const count = expired ? 0 : Number(current.count ?? 0);
        if (count >= limit) return false;
        transaction.set(reference, {
          scope,
          count:count + 1,
          windowStartedAt:Timestamp.fromDate(expired ? at : currentWindow),
          expiresAt:Timestamp.fromDate(new Date((expired ? at : currentWindow).getTime() + windowMs)),
          updatedAt:fieldValue.serverTimestamp(),
        });
        return true;
      });
    },

    async recordOperatorAlert(alert = {}) {
      const errorCode = safeErrorCode(alert.code, 'operation_failed');
      const fields = {event:'operator_alert',errorCode};
      if (alert.orderId != null) fields.orderId = requiredId(alert.orderId, 'orderId');
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        transaction.create(receipt, auditReceipt(fields, fieldValue));
        return true;
      });
    },

    async createReservedDigitalOrder({recipientBinding: rawBinding, orderId, order: rawOrder} = {}) {
      const binding = recipientBinding(rawBinding);
      const id = requiredId(orderId, 'orderId');
      const order = normalizeOrder(rawOrder);
      if (!order.customerUid) throw repositoryError('ORDER_INVALID', 'customerUid is required');
      const reservationId = digestId('pilot-order-reservation', binding, order.sku);
      const reservation = reservations.doc(reservationId);
      const reference = orderRef(id);
      const createEffect = effectRef(id, 'invoice_create');
      const sendEffect = effectRef(id, 'invoice_send');
      const receipt = auditRef();

      return db.runTransaction(async transaction => {
        const existingReservation = await transaction.get(reservation);
        if (existingReservation.exists) {
          const data = existingReservation.data();
          if (data.customerUid !== order.customerUid || data.sku !== order.sku) {
            throw repositoryError('ORDER_RESERVATION_CONFLICT', 'Order reservation ownership is inconsistent');
          }
          const existingOrder = await transaction.get(orderRef(data.orderId));
          if (!existingOrder.exists || existingOrder.data().customerUid !== order.customerUid) {
            throw repositoryError('ORDER_RESERVATION_CONFLICT', 'Order reservation ownership is inconsistent');
          }
          return Object.freeze({
            orderId: data.orderId,
            idempotencyKey: `bk-order-${data.orderId}`,
            duplicate: true,
          });
        }

        const timestamp = fieldValue.serverTimestamp();
        transaction.create(reference, orderDocument(order, id));
        transaction.create(reservation, {
          orderId: id,
          customerUid: order.customerUid,
          sku: order.sku,
          createdAt: timestamp,
        });
        transaction.create(createEffect, pendingEffect(id, 'invoice_create'));
        transaction.create(sendEffect, pendingEffect(id, 'invoice_send'));
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'order_created',
          toStatus: order.status,
        }, fieldValue));
        return Object.freeze({orderId: id, idempotencyKey: `bk-order-${id}`, duplicate: false});
      });
    },

    async createPilotAuthEmailEffect(rawBinding) {
      const reference = pilotAuthRef(rawBinding);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const existing = await transaction.get(reference);
        if (existing.exists) return false;
        const timestamp = fieldValue.serverTimestamp();
        transaction.create(reference, {
          effect: 'pilot_auth_email',
          status: 'pending',
          claim: null,
          dispatchStartedAt: null,
          dispatchAttemptCount: 0,
          lastErrorCode: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(receipt, effectReceipt({
          event: 'effect_created', effect: 'pilot_auth_email',
        }, fieldValue));
        return true;
      });
    },

    async recordPilotAuthRequestAllowedDisabled() {
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        transaction.create(receipt, effectReceipt({
          event: 'pilot_auth_request_allowed_disabled', effect: 'pilot_auth_email',
        }, fieldValue));
        return true;
      });
    },

    async claimPilotAuthEmailEffect(rawBinding, workerId, now = clock()) {
      const reference = pilotAuthRef(rawBinding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(claimIdFactory(), 'claimId');
      const claimedAt = dateValue(now, 'now');
      const claimedTimestamp = Timestamp.fromDate(claimedAt);
      const expires = Timestamp.fromDate(new Date(claimedAt.getTime() + EFFECT_LEASE_MILLISECONDS));
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return false;
        const effect = snapshot.data();
        if (effect.status !== 'pending' || effect.dispatchAttemptCount !== 0) return false;
        if (effect.nextAttemptAt && timestampDate(effect.nextAttemptAt, 'nextAttemptAt') > claimedAt) return false;
        transaction.set(reference, {
          ...effect,
          status: 'claimed',
          claim: {workerId: worker, claimId, claimedAt: claimedTimestamp, leaseExpiresAt: expires},
          updatedAt: fieldValue.serverTimestamp(),
        });
        transaction.create(receipt, effectReceipt({
          event: 'effect_claimed', effect: 'pilot_auth_email', workerId: worker, claimId,
        }, fieldValue));
        return Object.freeze({claimId});
      });
    },

    async markPilotAuthDispatchStarted(rawBinding, workerId, rawClaimId, now = clock()) {
      const reference = pilotAuthRef(rawBinding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const dispatchStartedAt = Timestamp.fromDate(dateValue(now, 'now'));
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        const effect = snapshot.data();
        if (!effectClaimMatches(effect, worker, claimId)) {
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        if (timestampDate(effect.claim.leaseExpiresAt, 'leaseExpiresAt') <= dateValue(now, 'now')) {
          throw repositoryError('EFFECT_LEASE_EXPIRED', 'Effect lease has expired');
        }
        if (effect.dispatchStartedAt != null || effect.dispatchAttemptCount !== 0) {
          throw repositoryError('EFFECT_DISPATCH_EXHAUSTED', 'Effect dispatch attempt is exhausted');
        }
        transaction.set(reference, {
          ...effect,
          dispatchStartedAt,
          dispatchAttemptCount: 1,
          updatedAt: fieldValue.serverTimestamp(),
        });
        return true;
      });
    },

    async completePilotAuthEmailEffect(rawBinding, workerId, rawClaimId) {
      const reference = pilotAuthRef(rawBinding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        const effect = snapshot.data();
        if (!effectClaimMatches(effect, worker, claimId)) {
          if (effect.status === 'completed' && effect.lastClaimId === claimId) return false;
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        if (effect.dispatchStartedAt == null || effect.dispatchAttemptCount !== 1) {
          throw repositoryError('EFFECT_DISPATCH_REQUIRED', 'Effect dispatch was not started');
        }
        transaction.set(reference, {
          ...effect,
          status: 'completed',
          claim: null,
          lastClaimId: claimId,
          lastErrorCode: null,
          completedAt: fieldValue.serverTimestamp(),
          updatedAt: fieldValue.serverTimestamp(),
        });
        transaction.create(receipt, effectReceipt({
          event: 'effect_completed', effect: 'pilot_auth_email', workerId: worker, claimId,
        }, fieldValue));
        return true;
      });
    },

    async recordPilotAuthEmailFailure(rawBinding, workerId, rawClaimId, failure = {}) {
      const reference = pilotAuthRef(rawBinding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        const effect = snapshot.data();
        if (!effectClaimMatches(effect, worker, claimId)) {
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        const ambiguous = effect.dispatchStartedAt != null;
        const errorCode = ambiguous
          ? 'pilot_auth_email_unknown'
          : safeErrorCode(failure.code, 'pilot_auth_link_generation_failed');
        transaction.set(reference, {
          ...effect,
          status: ambiguous ? 'manual_review' : 'claimed',
          claim: ambiguous ? null : effect.claim,
          lastClaimId: ambiguous ? claimId : effect.lastClaimId,
          lastErrorCode: errorCode,
          updatedAt: fieldValue.serverTimestamp(),
        });
        transaction.create(receipt, effectReceipt({
          event: ambiguous ? 'effect_manual_review' : 'effect_failed',
          effect: 'pilot_auth_email', workerId: worker, claimId, errorCode,
        }, fieldValue));
        return true;
      });
    },

    async claimEffect(orderId, rawEffect, workerId, now = clock()) {
      const id = requiredId(orderId, 'orderId');
      const effectName = effectType(rawEffect);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(claimIdFactory(), 'claimId');
      const claimedAt = dateValue(now, 'now');
      const claimedTimestamp = Timestamp.fromDate(claimedAt);
      const expires = Timestamp.fromDate(new Date(claimedAt.getTime() + EFFECT_LEASE_MILLISECONDS));
      const reference = effectRef(id, effectName);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const [effectSnapshot, orderSnapshot, createEffectSnapshot] = await Promise.all([
          transaction.get(reference), transaction.get(orderRef(id)),
          effectName === 'invoice_send'
            ? transaction.get(effectRef(id, 'invoice_create'))
            : Promise.resolve(null),
        ]);
        if (!effectSnapshot.exists || !orderSnapshot.exists) return false;
        const effect = effectSnapshot.data();
        const order = orderSnapshot.data();
        if (effect.status !== 'pending') return false;
        if (effect.nextAttemptAt && timestampDate(effect.nextAttemptAt, 'nextAttemptAt') > claimedAt) return false;
        if (effectName === 'invoice_send' && (
          !order.providerRefs?.invoiceId
          || order.providerRefs.providerOrderRef !== `bk-order-${id}`
          || !createEffectSnapshot?.exists
          || createEffectSnapshot.data().status !== 'completed'
          || order.status === 'manual_review'
        )) return false;
        transaction.set(reference, {
          ...effect,
          status: 'claimed',
          claim: {workerId: worker, claimId, claimedAt: claimedTimestamp, leaseExpiresAt: expires},
          updatedAt: fieldValue.serverTimestamp(),
        });
        transaction.create(receipt, effectReceipt({
          orderId: id, event: 'effect_claimed', effect: effectName,
          workerId: worker, claimId,
        }, fieldValue));
        return Object.freeze({claimId});
      });
    },

    async markEffectDispatchStarted(orderId, rawEffect, workerId, rawClaimId, now = clock()) {
      const id = requiredId(orderId, 'orderId');
      const effectName = effectType(rawEffect);
      if (effectName !== 'invoice_send') {
        throw repositoryError('ORDER_INVALID', 'Only send effects cross the dispatch boundary');
      }
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const reference = effectRef(id, effectName);
      const dispatchStartedAt = Timestamp.fromDate(dateValue(now, 'now'));
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        const effect = snapshot.data();
        if (!effectClaimMatches(effect, worker, claimId)) {
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        if (timestampDate(effect.claim.leaseExpiresAt, 'leaseExpiresAt') <= dateValue(now, 'now')) {
          throw repositoryError('EFFECT_LEASE_EXPIRED', 'Effect lease has expired');
        }
        if (effect.dispatchStartedAt != null || effect.dispatchAttemptCount !== 0) {
          throw repositoryError('EFFECT_DISPATCH_EXHAUSTED', 'Effect dispatch attempt is exhausted');
        }
        transaction.set(reference, {
          ...effect,
          dispatchStartedAt,
          dispatchAttemptCount: 1,
          updatedAt: fieldValue.serverTimestamp(),
        });
        return true;
      });
    },

    async completeEffect(orderId, rawEffect, workerId, rawClaimId, result = {}) {
      const id = requiredId(orderId, 'orderId');
      const effectName = effectType(rawEffect);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const providerRefs = effectName === 'invoice_create'
        ? normalizeProviderRefs(result.providerRefs)
        : Object.freeze({});
      const reference = effectRef(id, effectName);
      const orderReference = orderRef(id);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const [effectSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(reference), transaction.get(orderReference),
        ]);
        if (!effectSnapshot.exists || !orderSnapshot.exists) {
          throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        }
        const effect = effectSnapshot.data();
        const order = orderSnapshot.data();
        const mergedProviderRefs = mergeProviderRefs(order.providerRefs, providerRefs);
        if (!effectClaimMatches(effect, worker, claimId)) {
          if (effect.status === 'completed' && effect.lastClaimId === claimId) return false;
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        if (effectName === 'invoice_create') {
          const required = ['realmId', 'invoiceId', 'customerId', 'providerOrderRef'];
          if (!required.every(key => Object.hasOwn(providerRefs, key))) {
            throw repositoryError('UNSAFE_PROVIDER_REFS', 'Invoice references are incomplete');
          }
          if (providerRefs.providerOrderRef !== `bk-order-${id}`) {
            throw repositoryError('PROVIDER_REF_CONFLICT', 'Provider order reference is invalid');
          }
        }
        if (effectName === 'invoice_send' && (
          effect.dispatchStartedAt == null || effect.dispatchAttemptCount !== 1
        )) {
          throw repositoryError('EFFECT_DISPATCH_REQUIRED', 'Effect dispatch was not started');
        }
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(orderReference, {
          ...order,
          providerRefs: mergedProviderRefs,
          lastErrorCode: null,
          updatedAt: timestamp,
        });
        transaction.set(reference, {
          ...effect,
          status: 'completed',
          claim: null,
          lastClaimId: claimId,
          lastErrorCode: null,
          completedAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(receipt, effectReceipt({
          orderId: id, event: 'effect_completed', effect: effectName,
          workerId: worker, claimId,
        }, fieldValue));
        return true;
      });
    },

    async recordEffectFailure(orderId, rawEffect, workerId, rawClaimId, failure = {}, now = clock()) {
      const id = requiredId(orderId, 'orderId');
      const effectName = effectType(rawEffect);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const failedDate = dateValue(now, 'now');
      const reference = effectRef(id, effectName);
      const orderReference = orderRef(id);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const [effectSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(reference), transaction.get(orderReference),
        ]);
        if (!effectSnapshot.exists || !orderSnapshot.exists) {
          throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        }
        const effect = effectSnapshot.data();
        const order = orderSnapshot.data();
        if (!effectClaimMatches(effect, worker, claimId)) {
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        const ambiguousSend = effectName === 'invoice_send' && effect.dispatchStartedAt != null;
        const errorCode = ambiguousSend
          ? 'invoice_send_unknown'
          : safeErrorCode(failure.code);
        const attemptCount = Math.min(Number(effect.attemptCount ?? 0) + 1, 8);
        const retryDelay = Math.min(
          5 * 60 * 1000 * (2 ** (attemptCount - 1)),
          6 * 60 * 60 * 1000
        );
        const nextAttemptAt = Timestamp.fromDate(new Date(failedDate.getTime() + retryDelay));
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...effect,
          status: ambiguousSend ? 'manual_review' : 'pending',
          claim: null,
          lastClaimId: ambiguousSend ? claimId : effect.lastClaimId,
          lastErrorCode: errorCode,
          attemptCount,
          nextAttemptAt: ambiguousSend ? null : nextAttemptAt,
          updatedAt: timestamp,
        });
        transaction.set(orderReference, ambiguousSend ? {
          ...order,
          status: 'manual_review',
          terminal: true,
          activeTransition: null,
          reconciliationDueAt: null,
          lastErrorCode: errorCode,
          updatedAt: timestamp,
        } : {
          ...order,
          terminal: false,
          reconciliationDueAt: nextAttemptAt,
          lastErrorCode: errorCode,
          updatedAt: timestamp,
        });
        transaction.create(receipt, effectReceipt({
          orderId: id,
          event: ambiguousSend ? 'effect_manual_review' : 'effect_failed',
          effect: effectName,
          workerId: worker,
          claimId,
          errorCode,
        }, fieldValue));
        return true;
      });
    },

    async recoverExpiredEffects(now = clock()) {
      const cutoff = Timestamp.fromDate(dateValue(now, 'now'));
      const snapshot = await effects
        .where('claim.leaseExpiresAt', '<=', cutoff)
        .orderBy('claim.leaseExpiresAt', 'asc')
        .limit(100)
        .get();
      const recovered = {
        recoveredCreateOrderIds: [],
        recoveredPilotAuthBindings: [],
        manualReviewOrderIds: [],
        manualReviewPilotAuthBindings: [],
      };
      for (const document of snapshot.docs) {
        const reference = effects.doc(document.id);
        await db.runTransaction(async transaction => {
          const current = await transaction.get(reference);
          if (!current.exists) return;
          const effect = current.data();
          if (effect.status !== 'claimed'
            || timestampDate(effect.claim?.leaseExpiresAt, 'leaseExpiresAt') > dateValue(now, 'now')) return;
          const timestamp = fieldValue.serverTimestamp();
          if (effect.effect === 'pilot_auth_email') {
            const binding = document.id.slice('pilot-auth-'.length);
            if (effect.dispatchStartedAt == null && effect.dispatchAttemptCount === 0) {
              transaction.set(reference, {
                ...effect, status: 'pending', claim: null,
                lastErrorCode: effect.lastErrorCode, updatedAt: timestamp,
              });
              recovered.recoveredPilotAuthBindings.push(binding);
              return;
            }
            transaction.set(reference, {
              ...effect, status: 'manual_review', claim: null,
              lastClaimId: effect.claim?.claimId,
              lastErrorCode: 'pilot_auth_email_unknown', updatedAt: timestamp,
            });
            recovered.manualReviewPilotAuthBindings.push(binding);
            return;
          }
          if (effect.effect === 'invoice_create') {
            transaction.set(reference, {
              ...effect, status: 'pending', claim: null,
              lastErrorCode: effect.lastErrorCode, nextAttemptAt: cutoff, updatedAt: timestamp,
            });
            recovered.recoveredCreateOrderIds.push(effect.orderId);
            return;
          }
          if (effect.effect === 'invoice_send') {
            const orderReference = orderRef(effect.orderId);
            const orderSnapshot = await transaction.get(orderReference);
            if (!orderSnapshot.exists) return;
            const order = orderSnapshot.data();
            transaction.set(reference, {
              ...effect, status: 'manual_review', claim: null,
              lastClaimId: effect.claim?.claimId,
              lastErrorCode: 'invoice_send_unknown', nextAttemptAt: null, updatedAt: timestamp,
            });
            transaction.set(orderReference, {
              ...order, status: 'manual_review', terminal: true, activeTransition: null,
              reconciliationDueAt: null, lastErrorCode: 'invoice_send_unknown', updatedAt: timestamp,
            });
            recovered.manualReviewOrderIds.push(effect.orderId);
          }
        });
      }
      return Object.freeze({
        recoveredCreateOrderIds: Object.freeze(recovered.recoveredCreateOrderIds),
        recoveredPilotAuthBindings: Object.freeze(recovered.recoveredPilotAuthBindings),
        manualReviewOrderIds: Object.freeze(recovered.manualReviewOrderIds),
        manualReviewPilotAuthBindings: Object.freeze(recovered.manualReviewPilotAuthBindings),
      });
    },

    async claimTransition(orderId, transition, workerId) {
      const id = requiredId(orderId, 'orderId');
      const nextStatus = requiredText(transition, 'transition', 64);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(claimIdFactory(), 'claimId');
      const claimedReconciliationAt = Timestamp.fromDate(dateValue(clock(), 'clock'));
      if (!isOrderStatus(nextStatus)) {
        throw repositoryError('ORDER_INVALID', 'transition is invalid');
      }
      const reference = orderRef(id);
      const receipt = auditRef();

      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        if (order.activeTransition != null || order.status === nextStatus
          || isFinalOrderStatus(order.status)) {
          return false;
        }
        if (!isAllowedOrderStatusTransition(order.status, nextStatus)) {
          throw repositoryError('INVALID_ORDER_TRANSITION', 'Order transition is invalid');
        }
        const timestamp = fieldValue.serverTimestamp();
        const revision = Number(order.revision ?? 0) + 1;
        transaction.set(reference, {
          ...order,
          status: nextStatus,
          terminal: false,
          reconciliationDueAt: claimedReconciliationAt,
          activeTransition: {
            claimId,
            transition: nextStatus,
            previousStatus: order.status,
            workerId: worker,
            revision,
            claimedAt: timestamp,
          },
          revision,
          updatedAt: timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'transition_claimed',
          fromStatus: order.status,
          toStatus: nextStatus,
          workerId: worker,
          claimId,
          revision,
        }, fieldValue));
        return Object.freeze({claimId, revision});
      });
    },

    async completeTransition(orderId, transition, workerId, rawClaimId, result = {}) {
      const id = requiredId(orderId, 'orderId');
      const nextStatus = requiredText(transition, 'transition', 64);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const providerRefs = normalizeProviderRefs(result.providerRefs);
      const nextReconciliationAt = Timestamp.fromDate(dateValue(
        result.reconciliationDueAt ?? clock(),
        'reconciliationDueAt'
      ));
      const reference = orderRef(id);
      const receipt = auditRef();

      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        const mergedProviderRefs = mergeProviderRefs(order.providerRefs, providerRefs);
        if (!matchingClaim(order, nextStatus, worker, claimId)) {
          if (order.activeTransition == null
            && order.lastTransition?.transition === nextStatus
            && order.lastTransition?.workerId === worker
            && order.lastTransition?.claimId === claimId) return false;
          throw repositoryError('TRANSITION_CLAIM_LOST', 'Transition claim is no longer held');
        }
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...order,
          providerRefs: mergedProviderRefs,
          terminal: isReconciliationTerminalStatus(nextStatus),
          activeTransition: null,
          lastErrorCode: null,
          retry: null,
          reconciliationDueAt: isReconciliationTerminalStatus(nextStatus)
            ? null
            : nextReconciliationAt,
          lastTransition: {
            claimId,
            transition: nextStatus,
            workerId: worker,
            revision: order.activeTransition.revision,
            completedAt: timestamp,
          },
          updatedAt: timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'transition_completed',
          toStatus: nextStatus,
          workerId: worker,
          claimId,
          revision: order.activeTransition.revision,
        }, fieldValue));
        return true;
      });
    },

    async recordFailure(orderId, transition, workerId, rawClaimId, failure = {}) {
      const id = requiredId(orderId, 'orderId');
      const nextStatus = requiredText(transition, 'transition', 64);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
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
        if (!matchingClaim(order, nextStatus, worker, claimId)) {
          throw repositoryError('TRANSITION_CLAIM_LOST', 'Transition claim is no longer held');
        }
        const restoredStatus = order.activeTransition.previousStatus;
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...order,
          status: restoredStatus,
          terminal: false,
          activeTransition: null,
          lastErrorCode: errorCode,
          reconciliationDueAt: retryAt,
          retry: {
            attemptCount: Number(order.retry?.attemptCount ?? 0) + 1,
            dueAt: retryAt,
          },
          updatedAt: timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId: id,
          event: 'transition_failed',
          fromStatus: nextStatus,
          toStatus: restoredStatus,
          workerId: worker,
          claimId,
          revision: order.activeTransition.revision,
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

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
  'documentNumber',
]);
const PROVIDER_VALUE = /^[A-Za-z0-9._:/-]{1,200}$/;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const EFFECT_DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const SAFE_ERROR_CODE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SHA256_DIGEST = /^[a-f0-9]{64}$/;
const EFFECT_TYPES = new Set(['invoice_create', 'invoice_send']);
const EFFECT_LEASE_MILLISECONDS = 5 * 60 * 1000;
const PILOT_AUTH_MAX_ISSUANCES = 5;
const WEBHOOK_ENTITY = new Set(['Invoice', 'Payment']);
const WEBHOOK_OPERATION = new Set(['Create', 'Update', 'Delete', 'Merge', 'Void']);
const RATE_LIMIT_SCOPE = new Set(['pilot_auth', 'order_status']);
const PUBLIC_AUTH_EFFECT = 'public_digital_auth_email';
const PUBLIC_AUTH_APP_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const PUBLIC_AUTH_NO_BACKGROUND_DISPATCH_AT = new Date('9999-12-31T23:59:59.999Z');
const PUBLIC_AUTH_RETENTION_MILLISECONDS = 24 * 60 * 60 * 1000;
const PUBLIC_AUTH_CLEANUP_LIMIT = 500;
const PAYMENT_RECOVERY_STATUSES = new Set([
  'pending_payment', 'payment_verifying', 'invoiced', 'paid', 'fulfilling',
]);

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

function normalizeAccountingSnapshot(value) {
  const keys=['fingerprint','itemId','itemName','provider','taxCode'];
  if (!plainObject(value) || Object.keys(value).sort().join(',') !== keys.join(',')
    || value.provider !== 'quickbooks'
    || typeof value.itemId !== 'string' || !PROVIDER_VALUE.test(value.itemId)
    || typeof value.itemName !== 'string' || value.itemName.length < 1 || value.itemName.length > 200
    || value.itemName !== value.itemName.trim()
    || typeof value.taxCode !== 'string' || !/^[A-Za-z0-9._:-]{1,32}$/.test(value.taxCode)
    || typeof value.fingerprint !== 'string' || !SHA256_DIGEST.test(value.fingerprint)) {
    throw repositoryError('ORDER_INVALID', 'accountingSnapshot is invalid');
  }
  const fingerprint=createHash('sha256')
    .update(`quickbooks\0${value.itemId}\0${value.itemName}\0${value.taxCode}`).digest('hex');
  if (value.fingerprint !== fingerprint) {
    throw repositoryError('ORDER_INVALID', 'accountingSnapshot is invalid');
  }
  return Object.freeze({provider:'quickbooks',itemId:value.itemId,itemName:value.itemName,
    taxCode:value.taxCode,fingerprint});
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
  if (orderType === 'digital_product') {
    normalized.accountingSnapshot=normalizeAccountingSnapshot(order.accountingSnapshot);
  }
  if (order.customerUid != null) {
    normalized.customerUid = requiredId(order.customerUid, 'customerUid', WORKER_ID);
  }
  if (order.authorizedRecipientBinding != null) {
    normalized.authorizedRecipientBinding = recipientBinding(order.authorizedRecipientBinding);
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

function normalizedWebhookHint(hint) {
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
  return Object.freeze({
    realmId:hint.realmId,
    entityName:hint.entityName,
    entityId:hint.entityId,
    operation:hint.operation,
    lastUpdated:new Date(hint.lastUpdated).toISOString(),
  });
}

function digestId(domain, ...parts) {
  const hash = createHash('sha256').update(`${domain}\0`);
  for (const part of parts) hash.update(`${part}\0`);
  return hash.digest('hex');
}

function publicAuthQuarantineId({email, sku, purpose} = {}) {
  const normalizedEmail = requiredText(email, 'email', 254);
  const product = requiredText(sku, 'sku', 128);
  const effectPurpose = requiredText(purpose, 'purpose', 64);
  return createHash('sha256').update(
    `public-auth-quarantine\0${normalizedEmail}\0${product}\0${effectPurpose}`
  ).digest('hex');
}

function publicAuthEffectId(identity = {}) {
  const quarantineBinding = publicAuthQuarantineId(identity);
  const {issuanceBucket} = identity;
  if (!Number.isSafeInteger(issuanceBucket) || issuanceBucket < 0) {
    throw repositoryError('ORDER_INVALID', 'issuanceBucket is invalid');
  }
  return createHash('sha256').update(`${quarantineBinding}\0${issuanceBucket}`).digest('hex');
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
  const allowed = ['orderId', 'event', 'effect', 'effectId', 'workerId', 'claimId', 'errorCode', 'retentionExpiresAt'];
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
    'effect',
    'effectId',
    'publicAuth',
    'cleanupEligible',
    'retentionExpiresAt',
    'actorUid',
    'quarantineBinding',
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
  const publicAuthRateLimits = db.collection('commercePublicAuthLimits');
  const publicAuthQuarantines = db.collection('commercePublicAuthQuarantines');
  const orderRef = orderId => orders.doc(requiredId(orderId, 'orderId'));
  const auditRef = () => audits.doc();
  const effectRef = (orderId, effect) => effects.doc(`${requiredId(orderId, 'orderId')}-${effectType(effect)}`);
  const pilotAuthRef = binding => effects.doc(`pilot-auth-${recipientBinding(binding)}`);
  const publicAuthEffectReference = binding => effects.doc(`public-auth-${requiredId(binding, 'binding', SHA256_DIGEST)}`);
  const publicAuthQuarantineRef = binding => publicAuthQuarantines.doc(
    `public-auth-${requiredId(binding, 'quarantineBinding', SHA256_DIGEST)}`
  );
  // One mutable audit receipt per opaque effect bounds audit cardinality across reissues.
  const publicAuthAuditRef = binding => audits.doc(
    `public-auth-${requiredId(binding, 'binding', SHA256_DIGEST)}`
  );
  const publicAuthRetentionExpiresAt = at => Timestamp.fromDate(new Date(
    dateValue(at, 'publicAuthRetentionAt').getTime() + PUBLIC_AUTH_RETENTION_MILLISECONDS
  ));
  const publicAuthAuditReceipt = (binding, fields, at = clock()) => auditReceipt({
    ...fields,
    publicAuth:true,
    cleanupEligible:fields.event !== 'operator_alert',
    effectId:`public-auth-${requiredId(binding, 'binding', SHA256_DIGEST)}`,
    retentionExpiresAt:publicAuthRetentionExpiresAt(at),
  }, fieldValue);

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
      nextAttemptAt: Timestamp.fromDate(dateValue(clock(), 'clock')),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function matchingClaim(order, transition, workerId, claimId) {
    return order.activeTransition?.transition === transition
      && order.activeTransition?.workerId === workerId
      && order.activeTransition?.claimId === claimId;
  }

  async function reserveDigitalOrder({
    rawBinding,orderId,rawOrder,sku,requireExplicitNewPurchase = false,
  }) {
    const binding = recipientBinding(rawBinding);
    const id = requiredId(orderId, 'orderId');
    const product = requiredText(sku, 'sku', 128);
    if (!plainObject(rawOrder) || !plainObject(rawOrder.customer)) {
      throw repositoryError('ORDER_INVALID', 'order is invalid');
    }
    const order = normalizeOrder({
      ...rawOrder,
      customer:{name:rawOrder.customer.name},
      authorizedRecipientBinding:binding,
    });
    if (!order.customerUid || order.sku !== product) {
      throw repositoryError('ORDER_INVALID', 'Public order ownership is invalid');
    }
    // Reuse the original reservation namespace so an owner-pilot order cannot be
    // duplicated when the same verified customer enters the public checkout.
    const reservationId = digestId('pilot-order-reservation', binding, product);
    const reservation = reservations.doc(reservationId);
    const reference = orderRef(id);
    const createEffect = effectRef(id, 'invoice_create');
    const sendEffect = effectRef(id, 'invoice_send');
    const receipt = auditRef();

    return db.runTransaction(async transaction => {
      const existingReservation = await transaction.get(reservation);
      if (existingReservation.exists) {
        const data = existingReservation.data();
        if (data.customerUid !== order.customerUid || data.sku !== product
          || data.authorizedRecipientBinding !== binding) {
          throw repositoryError('ORDER_RESERVATION_CONFLICT', 'Order reservation ownership is inconsistent');
        }
        const existingOrder = await transaction.get(orderRef(data.orderId));
        const stored = existingOrder.exists ? existingOrder.data() : null;
        if (!stored || stored.customerUid !== order.customerUid || stored.sku !== product
          || stored.authorizedRecipientBinding !== binding || !isOrderStatus(stored.status)) {
          throw repositoryError('ORDER_RESERVATION_CONFLICT', 'Order reservation ownership is inconsistent');
        }
        if (requireExplicitNewPurchase && isFinalOrderStatus(stored.status)) {
          throw repositoryError(
            'ORDER_NEW_PURCHASE_REQUIRED',
            'A new purchase rule is required for the completed order'
          );
        }
        return Object.freeze({
          orderId:data.orderId,
          idempotencyKey:`bk-order-${data.orderId}`,
          duplicate:true,
        });
      }

      const timestamp = fieldValue.serverTimestamp();
      transaction.create(reference, orderDocument(order, id));
      transaction.create(reservation, {
        orderId:id,
        customerUid:order.customerUid,
        sku:product,
        authorizedRecipientBinding:binding,
        createdAt:timestamp,
      });
      transaction.create(createEffect, pendingEffect(id, 'invoice_create'));
      transaction.create(sendEffect, pendingEffect(id, 'invoice_send'));
      transaction.create(receipt, auditReceipt({
        orderId:id,
        event:'order_created',
        toStatus:order.status,
      }, fieldValue));
      return Object.freeze({orderId:id,idempotencyKey:`bk-order-${id}`,duplicate:false});
    });
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

    async createServiceOrder(orderId, rawOrder) {
      const id = requiredId(orderId, 'orderId');
      const order = normalizeOrder(rawOrder);
      if (order.orderType !== 'service' || order.status !== 'pending_invoice_approval') {
        throw repositoryError('ORDER_INVALID', 'Service order is invalid');
      }
      const reference = orderRef(id);
      const createEffect = effectRef(id, 'invoice_create');
      const sendEffect = effectRef(id, 'invoice_send');
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const existing = await transaction.get(reference);
        if (existing.exists) {
          if (existing.data().idempotencyFingerprint !== fingerprint(order)) {
            throw repositoryError('ORDER_IDEMPOTENCY_CONFLICT', 'Service order changed');
          }
          return {orderId:id,duplicate:true};
        }
        transaction.create(reference, orderDocument(order,id));
        transaction.create(createEffect, pendingEffect(id,'invoice_create'));
        transaction.create(sendEffect, pendingEffect(id,'invoice_send'));
        transaction.create(receipt, auditReceipt({orderId:id,event:'order_created',toStatus:order.status},fieldValue));
        return {orderId:id,duplicate:false};
      });
    },

    async beginServiceInvoiceApproval(orderId) {
      const id = requiredId(orderId,'orderId');
      const reference = orderRef(id);
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND','Order was not found');
        const order = snapshot.data();
        if (order.orderType !== 'service') throw repositoryError('ORDER_INVALID','Service order is invalid');
        if (['invoice_processing','invoiced','manual_review'].includes(order.status)) return order.status;
        if (order.status !== 'pending_invoice_approval') throw repositoryError('INVALID_ORDER_TRANSITION','Approval is invalid');
        transaction.set(reference,{...order,status:'invoice_processing',revision:Number(order.revision ?? 0)+1,updatedAt:fieldValue.serverTimestamp()});
        return 'invoice_processing';
      });
    },

    async completeServiceInvoiceApproval(orderId, receipt = {}) {
      const id = requiredId(orderId,'orderId');
      const reference = orderRef(id);
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND','Order was not found');
        const order = snapshot.data();
        if (order.status === 'invoiced') return false;
        if (order.orderType !== 'service' || order.status !== 'invoice_processing') {
          throw repositoryError('INVALID_ORDER_TRANSITION','Invoice completion is invalid');
        }
        const normalizedReceipt = {
          invoiceId:requiredId(receipt.invoiceId,'invoiceId',PROVIDER_VALUE),
          documentNumber:receipt.documentNumber == null ? null : requiredId(receipt.documentNumber,'documentNumber',PROVIDER_VALUE),
          sendAccepted:receipt.sendAccepted === true,
        };
        transaction.set(reference,{...order,status:'invoiced',serviceInvoiceReceipt:normalizedReceipt,
          revision:Number(order.revision ?? 0)+1,reconciliationDueAt:Timestamp.fromDate(dateValue(clock(),'clock')),
          updatedAt:fieldValue.serverTimestamp()});
        return true;
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
      const normalized = normalizedWebhookHint(hint);
      const reference = webhookHints.doc(hintId);
      return db.runTransaction(async transaction => {
        const existing = await transaction.get(reference);
        if (existing.exists) return false;
        transaction.create(reference, normalized);
        return true;
      });
    },

    async storeWebhookHints(entries) {
      if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100) {
        throw repositoryError('ORDER_INVALID', 'Webhook hint batch is invalid');
      }
      const unique = new Map();
      for (const entry of entries) {
        if (!plainObject(entry)) throw repositoryError('ORDER_INVALID', 'Webhook hint batch is invalid');
        unique.set(recipientBinding(entry.id), normalizedWebhookHint(entry.hint));
      }
      const batch = db.batch();
      for (const [hintId,hint] of unique) batch.set(webhookHints.doc(hintId), hint);
      await batch.commit();
      return unique.size;
    },

    async listReconciliationHints(now = clock(), {limit = 50, ttlMs = 24 * 60 * 60 * 1000} = {}) {
      const maximum = Number(limit);
      if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100
        || !Number.isInteger(ttlMs) || ttlMs < 60 * 1000 || ttlMs > 7 * 24 * 60 * 60 * 1000) {
        throw repositoryError('ORDER_INVALID', 'Webhook hint query is invalid');
      }
      const at = dateValue(now, 'now');
      const cutoff = new Date(at.getTime() - ttlMs).toISOString();
      const snapshot = await webhookHints
        .where('lastUpdated','>=',cutoff)
        .orderBy('lastUpdated','asc')
        .limit(maximum)
        .get();
      return Object.freeze(snapshot.docs.map(document => Object.freeze({
        hintId:recipientBinding(document.id),...normalizedWebhookHint(document.data()),
      })));
    },

    async consumeReconciliationHints(rawHintIds) {
      if (!Array.isArray(rawHintIds) || rawHintIds.length < 1 || rawHintIds.length > 100) {
        throw repositoryError('ORDER_INVALID', 'Webhook hint identifiers are invalid');
      }
      const hintIds = [...new Set(rawHintIds.map(recipientBinding))];
      const batch = db.batch();
      for (const hintId of hintIds) batch.delete(webhookHints.doc(hintId));
      await batch.commit();
      return hintIds.length;
    },

    async purgeExpiredWebhookHints(now = clock(), {limit = 50, ttlMs = 24 * 60 * 60 * 1000} = {}) {
      const maximum = Number(limit);
      if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100
        || !Number.isInteger(ttlMs) || ttlMs < 60 * 1000 || ttlMs > 7 * 24 * 60 * 60 * 1000) {
        throw repositoryError('ORDER_INVALID', 'Webhook hint purge is invalid');
      }
      const at = dateValue(now, 'now');
      const cutoff = new Date(at.getTime() - ttlMs).toISOString();
      const snapshot = await webhookHints
        .where('lastUpdated','<=',cutoff)
        .orderBy('lastUpdated','asc')
        .limit(maximum)
        .get();
      if (snapshot.docs.length === 0) return 0;
      const batch = db.batch();
      for (const document of snapshot.docs) batch.delete(webhookHints.doc(document.id));
      await batch.commit();
      return snapshot.docs.length;
    },

    async findOrderByInvoiceId(rawRealmId, rawInvoiceId) {
      const realmId = requiredId(rawRealmId, 'realmId', PROVIDER_VALUE);
      const invoiceId = requiredId(rawInvoiceId, 'invoiceId', PROVIDER_VALUE);
      const snapshot = await orders
        .where('providerRefs.invoiceId','==',invoiceId)
        .where('providerRefs.realmId','==',realmId)
        .limit(2)
        .get();
      const matches = snapshot.docs
        .map(document => ({id:document.id,...document.data()}))
        .filter(order => order.providerRefs?.realmId === realmId);
      if (matches.length > 1) {
        throw repositoryError('PROVIDER_REF_CONFLICT', 'Invoice reference is ambiguous');
      }
      return matches[0] ?? null;
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

    async consumePublicAuthLimits({
      emailDigest,ipDigest,appId,now = clock(),windowMs,
      emailLimit,ipLimit,appGlobalLimit,
    } = {}) {
      if (!SHA256_DIGEST.test(emailDigest) || !SHA256_DIGEST.test(ipDigest)
        || typeof appId !== 'string' || !PUBLIC_AUTH_APP_ID.test(appId)
        || !Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 24 * 60 * 60 * 1000
        || ![emailLimit,ipLimit,appGlobalLimit].every(limit => (
          Number.isInteger(limit) && limit >= 1 && limit <= 1000
        ))) {
        throw repositoryError('ORDER_INVALID', 'Public auth limit input is invalid');
      }
      const at = dateValue(now, 'now');
      const windowStartedAt = new Date(Math.floor(at.getTime() / windowMs) * windowMs);
      const windowExpiresAt = new Date(windowStartedAt.getTime() + windowMs);
      const dimensions = [
        ['email', emailDigest, emailLimit],
        ['ip', ipDigest, ipLimit],
        ['app_global', digestId('public-auth-app-global', appId), appGlobalLimit],
      ].map(([scope, key, limit]) => Object.freeze({
        scope,key,limit,reference:publicAuthRateLimits.doc(`public-auth-${scope}-${key}`),
      }));
      return db.runTransaction(async transaction => {
        const snapshots = await Promise.all(dimensions.map(dimension => transaction.get(dimension.reference)));
        const counts = snapshots.map(snapshot => {
          const current = snapshot.exists ? snapshot.data() : null;
          const currentWindow = current?.windowStartedAt
            ? timestampDate(current.windowStartedAt, 'windowStartedAt')
            : null;
          return currentWindow?.getTime() === windowStartedAt.getTime()
            ? Number(current.count ?? 0)
            : 0;
        });
        if (counts.some((count,index) => !Number.isSafeInteger(count) || count >= dimensions[index].limit)) {
          return false;
        }
        for (const [index, dimension] of dimensions.entries()) {
          transaction.set(dimension.reference, {
            publicAuth:true,scope:dimension.scope,count:counts[index] + 1,
            windowStartedAt:Timestamp.fromDate(windowStartedAt),
            expiresAt:Timestamp.fromDate(windowExpiresAt),updatedAt:fieldValue.serverTimestamp(),
          });
        }
        return true;
      });
    },

    async cleanupExpiredPublicAuthArtifacts(now = clock(), {limit = PUBLIC_AUTH_CLEANUP_LIMIT} = {}) {
      const at = dateValue(now, 'now');
      if (!Number.isInteger(limit) || limit < 4 || limit > PUBLIC_AUTH_CLEANUP_LIMIT) {
        throw repositoryError('ORDER_INVALID', 'Public auth cleanup limit is invalid');
      }
      const cutoff = Timestamp.fromDate(at);
      const collect = async (collection, field, referenceFor, maximum, eligibleField = null) => {
        let query = collection.where('publicAuth', '==', true);
        if (eligibleField != null) query = query.where(eligibleField, '==', true);
        const snapshot = await query
          .where(field, '<=', cutoff).orderBy(field, 'asc')
          .limit(maximum).get();
        const references = [];
        for (const document of snapshot.docs) {
          if (!document.id.startsWith('public-auth-')) continue;
          references.push(referenceFor(document.id));
          if (references.length >= maximum) return references;
        }
        return references;
      };
      const rateBudget = Math.ceil(limit / 2);
      const effectBudget = Math.floor((limit - rateBudget) / 2);
      const auditBudget = limit - rateBudget - effectBudget;
      const [rates, publicEffects, publicAudits] = await Promise.all([
        collect(publicAuthRateLimits, 'expiresAt', id => publicAuthRateLimits.doc(id), rateBudget),
        collect(effects, 'retentionExpiresAt', id => effects.doc(id), effectBudget, 'cleanupEligible'),
        collect(audits, 'retentionExpiresAt', id => audits.doc(id), auditBudget, 'cleanupEligible'),
      ]);
      const deleteRate = async reference => db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        if (current?.publicAuth !== true || !current.expiresAt
          || timestampDate(current.expiresAt, 'expiresAt') > at) return false;
        transaction.delete(reference);
        return true;
      });
      const deleteEffect = async reference => db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        const safeState = current?.status === 'completed'
          || (current?.status === 'pending' && current.dispatchAttemptCount === 0 && current.claim == null);
        if (current?.publicAuth !== true || current.cleanupEligible !== true
          || current.effect !== PUBLIC_AUTH_EFFECT || !safeState
          || !current.retentionExpiresAt
          || timestampDate(current.retentionExpiresAt, 'retentionExpiresAt') > at) return false;
        transaction.delete(reference);
        return true;
      });
      const deleteAudit = async reference => db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        if (current?.publicAuth !== true || current.cleanupEligible !== true
          || current.event === 'operator_alert' || !current.retentionExpiresAt
          || timestampDate(current.retentionExpiresAt, 'retentionExpiresAt') > at
          || typeof current.effectId !== 'string' || !/^public-auth-[a-f0-9]{64}$/.test(current.effectId)) return false;
        const effectSnapshot = await transaction.get(effects.doc(current.effectId));
        if (effectSnapshot.exists && effectSnapshot.data()?.status === 'manual_review') return false;
        transaction.delete(reference);
        return true;
      });
      const outcomes = await Promise.all([
        ...rates.map(deleteRate), ...publicEffects.map(deleteEffect), ...publicAudits.map(deleteAudit),
      ]);
      return Object.freeze({deletedCount:outcomes.filter(Boolean).length});
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

    async reservePublicDigitalOrder({customerBinding, sku, orderId, order} = {}) {
      return reserveDigitalOrder({
        rawBinding:customerBinding,sku,orderId,rawOrder:order,requireExplicitNewPurchase:true,
      });
    },

    async createReservedDigitalOrder({recipientBinding, orderId, order} = {}) {
      return reserveDigitalOrder({
        rawBinding:recipientBinding,sku:order?.sku,orderId,rawOrder:order,
      });
    },

    async createPilotAuthEmailEffect(rawBinding) {
      const reference = pilotAuthRef(rawBinding);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const existing = await transaction.get(reference);
        const timestamp = fieldValue.serverTimestamp();
        if (existing.exists) {
          const effect = existing.data();
          const issuanceAttemptCount = Number.isInteger(effect.issuanceAttemptCount)
            ? effect.issuanceAttemptCount
            : 1;
          if (effect.status !== 'completed' || issuanceAttemptCount >= PILOT_AUTH_MAX_ISSUANCES) {
            return false;
          }
          transaction.set(reference, {
            ...effect,
            status: 'pending',
            claim: null,
            dispatchStartedAt: null,
            dispatchAttemptCount: 0,
            issuanceAttemptCount: issuanceAttemptCount + 1,
            lastClaimId: null,
            lastErrorCode: null,
            nextAttemptAt: Timestamp.fromDate(dateValue(clock(), 'clock')),
            completedAt: null,
            updatedAt: timestamp,
          });
          transaction.create(receipt, effectReceipt({
            event: 'effect_reissued', effect: 'pilot_auth_email',
          }, fieldValue));
          return true;
        }
        transaction.create(reference, {
          effect: 'pilot_auth_email',
          status: 'pending',
          claim: null,
          dispatchStartedAt: null,
          dispatchAttemptCount: 0,
          issuanceAttemptCount: 1,
          lastErrorCode: null,
          nextAttemptAt: Timestamp.fromDate(dateValue(clock(), 'clock')),
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
          nextAttemptAt: null,
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
      const alertReceipt = auditRef();
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
        if (ambiguous) {
          transaction.create(alertReceipt, auditReceipt({
            event:'operator_alert',errorCode:'pilot_auth_email_unknown',
          }, fieldValue));
        }
        return true;
      });
    },

    async createPublicDigitalAuthEmailEffect(identity = {}) {
      const binding = publicAuthEffectId(identity);
      const quarantineBinding = publicAuthQuarantineId(identity);
      const reference = publicAuthEffectReference(binding);
      const quarantineReference = publicAuthQuarantineRef(quarantineBinding);
      const receipt = publicAuthAuditRef(binding);
      const retainedAt = dateValue(clock(), 'clock');
      return db.runTransaction(async transaction => {
        const [quarantine,existing] = await Promise.all([
          transaction.get(quarantineReference),transaction.get(reference),
        ]);
        if (quarantine.exists && quarantine.data()?.active === true) return false;
        const timestamp = fieldValue.serverTimestamp();
        if (existing.exists) {
          const effect = existing.data();
          const issuanceAttemptCount = Number.isInteger(effect.issuanceAttemptCount)
            ? effect.issuanceAttemptCount
            : 1;
          if (effect.effect === PUBLIC_AUTH_EFFECT && effect.status === 'pending'
            && effect.dispatchAttemptCount === 0) return Object.freeze({binding});
          if (effect.effect !== PUBLIC_AUTH_EFFECT || effect.status !== 'completed'
            || issuanceAttemptCount >= PILOT_AUTH_MAX_ISSUANCES) return false;
          transaction.set(reference, {
            ...effect,publicAuth:true,cleanupEligible:true,status:'pending',claim:null,dispatchStartedAt:null,dispatchAttemptCount:0,
            issuanceAttemptCount:issuanceAttemptCount + 1,lastClaimId:null,lastErrorCode:null,
            nextAttemptAt:Timestamp.fromDate(PUBLIC_AUTH_NO_BACKGROUND_DISPATCH_AT),
            completedAt:null,retentionExpiresAt:publicAuthRetentionExpiresAt(retainedAt),updatedAt:timestamp,
          });
          transaction.set(receipt, publicAuthAuditReceipt(binding,{
            event:'effect_reissued',effect:PUBLIC_AUTH_EFFECT,
          },retainedAt));
          return Object.freeze({binding});
        }
        transaction.create(reference, {
          publicAuth:true,cleanupEligible:true,effect:PUBLIC_AUTH_EFFECT,quarantineBinding,status:'pending',claim:null,dispatchStartedAt:null,
          dispatchAttemptCount:0,issuanceAttemptCount:1,lastErrorCode:null,
          nextAttemptAt:Timestamp.fromDate(PUBLIC_AUTH_NO_BACKGROUND_DISPATCH_AT),
          retentionExpiresAt:publicAuthRetentionExpiresAt(retainedAt),createdAt:timestamp,updatedAt:timestamp,
        });
        transaction.set(receipt, publicAuthAuditReceipt(binding,{
          event:'effect_created',effect:PUBLIC_AUTH_EFFECT,
        },retainedAt));
        return Object.freeze({binding});
      });
    },

    async claimPublicDigitalAuthEmailEffect(rawBinding, workerId, now = clock()) {
      const binding = requiredId(rawBinding, 'binding', SHA256_DIGEST);
      const reference = publicAuthEffectReference(binding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(claimIdFactory(), 'claimId');
      const claimedAt = dateValue(now, 'now');
      const claimedTimestamp = Timestamp.fromDate(claimedAt);
      const expires = Timestamp.fromDate(new Date(claimedAt.getTime() + EFFECT_LEASE_MILLISECONDS));
      const receipt = publicAuthAuditRef(binding);
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return false;
        const effect = snapshot.data();
        if (effect.effect !== PUBLIC_AUTH_EFFECT || effect.status !== 'pending'
          || effect.dispatchAttemptCount !== 0) return false;
        transaction.set(reference, {
          ...effect,cleanupEligible:false,status:'claimed',claim:{workerId:worker,claimId,claimedAt:claimedTimestamp,leaseExpiresAt:expires},
          nextAttemptAt:null,updatedAt:fieldValue.serverTimestamp(),
        });
        transaction.set(receipt,publicAuthAuditReceipt(binding,{
          event:'effect_claimed',effect:PUBLIC_AUTH_EFFECT,workerId:worker,claimId,
        },claimedAt));
        return Object.freeze({claimId});
      });
    },

    async markPublicDigitalAuthDispatchStarted(rawBinding, workerId, rawClaimId, now = clock()) {
      const binding = requiredId(rawBinding, 'binding', SHA256_DIGEST);
      const reference = publicAuthEffectReference(binding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const dispatchStartedAt = Timestamp.fromDate(dateValue(now, 'now'));
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        const effect = snapshot.data();
        if (effect.effect !== PUBLIC_AUTH_EFFECT || !effectClaimMatches(effect,worker,claimId)) {
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        if (timestampDate(effect.claim.leaseExpiresAt, 'leaseExpiresAt') <= dateValue(now, 'now')) {
          throw repositoryError('EFFECT_LEASE_EXPIRED', 'Effect lease has expired');
        }
        if (effect.dispatchStartedAt != null || effect.dispatchAttemptCount !== 0) {
          throw repositoryError('EFFECT_DISPATCH_EXHAUSTED', 'Effect dispatch attempt is exhausted');
        }
        transaction.set(reference,{...effect,dispatchStartedAt,dispatchAttemptCount:1,updatedAt:fieldValue.serverTimestamp()});
        return true;
      });
    },

    async completePublicDigitalAuthEmailEffect(rawBinding, workerId, rawClaimId) {
      const binding = requiredId(rawBinding, 'binding', SHA256_DIGEST);
      const reference = publicAuthEffectReference(binding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const receipt = publicAuthAuditRef(binding);
      const retainedAt = dateValue(clock(), 'clock');
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        const effect = snapshot.data();
        if (effect.effect !== PUBLIC_AUTH_EFFECT || !effectClaimMatches(effect,worker,claimId)) {
          if (effect.effect === PUBLIC_AUTH_EFFECT && effect.status === 'completed' && effect.lastClaimId === claimId) return false;
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        if (effect.dispatchStartedAt == null || effect.dispatchAttemptCount !== 1) {
          throw repositoryError('EFFECT_DISPATCH_REQUIRED', 'Effect dispatch was not started');
        }
        transaction.set(reference,{...effect,cleanupEligible:true,status:'completed',claim:null,lastClaimId:claimId,lastErrorCode:null,
          retentionExpiresAt:publicAuthRetentionExpiresAt(retainedAt),
          completedAt:fieldValue.serverTimestamp(),updatedAt:fieldValue.serverTimestamp()});
        transaction.set(receipt,publicAuthAuditReceipt(binding,{
          event:'effect_completed',effect:PUBLIC_AUTH_EFFECT,workerId:worker,claimId,
        },retainedAt));
        return true;
      });
    },

    async recordPublicDigitalAuthEmailFailure(rawBinding, workerId, rawClaimId, failure = {}) {
      const binding = requiredId(rawBinding, 'binding', SHA256_DIGEST);
      const reference = publicAuthEffectReference(binding);
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const receipt = publicAuthAuditRef(binding);
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('EFFECT_NOT_FOUND', 'Effect was not found');
        const effect = snapshot.data();
        if (effect.effect !== PUBLIC_AUTH_EFFECT || !effectClaimMatches(effect,worker,claimId)) {
          throw repositoryError('EFFECT_CLAIM_LOST', 'Effect claim is no longer held');
        }
        const ambiguous = effect.dispatchStartedAt != null;
        const errorCode = ambiguous ? 'public_digital_auth_email_unknown'
          : safeErrorCode(failure.code, 'public_digital_auth_link_generation_failed');
        transaction.set(reference,{...effect,cleanupEligible:false,status:ambiguous ? 'manual_review' : 'claimed',
          claim:ambiguous ? null : effect.claim,lastClaimId:ambiguous ? claimId : effect.lastClaimId,
          lastErrorCode:errorCode,updatedAt:fieldValue.serverTimestamp()});
        if (ambiguous && SHA256_DIGEST.test(effect.quarantineBinding)) {
          transaction.set(publicAuthQuarantineRef(effect.quarantineBinding),{
            publicAuth:true,active:true,reasonCode:'public_digital_auth_email_unknown',
            effectId:`public-auth-${binding}`,createdAt:fieldValue.serverTimestamp(),
            updatedAt:fieldValue.serverTimestamp(),
          });
        }
        transaction.set(receipt,publicAuthAuditReceipt(binding,{
          event:ambiguous ? 'operator_alert' : 'effect_failed',
          effect:PUBLIC_AUTH_EFFECT,workerId:worker,claimId,errorCode,
        }));
        return true;
      });
    },

    async resolvePublicAuthQuarantine(identity = {}) {
      const adminUid = requiredId(identity.adminUid, 'adminUid', WORKER_ID);
      const quarantineBinding = publicAuthQuarantineId(identity);
      const reference = publicAuthQuarantineRef(quarantineBinding);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists || snapshot.data()?.active !== true) return false;
        transaction.set(reference,{
          ...snapshot.data(),active:false,resolvedBy:adminUid,
          resolvedAt:fieldValue.serverTimestamp(),updatedAt:fieldValue.serverTimestamp(),
        });
        transaction.create(receipt,auditReceipt({
          event:'public_auth_quarantine_resolved',actorUid:adminUid,
          quarantineBinding,
        },fieldValue));
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
          nextAttemptAt: null,
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
      const alertReceipt = auditRef();
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
        const terminalCreate = effectName === 'invoice_create' && failure.terminal === true;
        const manualReview = ambiguousSend || terminalCreate;
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
          status: manualReview ? 'manual_review' : 'pending',
          claim: null,
          lastClaimId: manualReview ? claimId : effect.lastClaimId,
          lastErrorCode: errorCode,
          attemptCount,
          nextAttemptAt: manualReview ? null : nextAttemptAt,
          updatedAt: timestamp,
        });
        transaction.set(orderReference, manualReview ? {
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
          event: manualReview ? 'effect_manual_review' : 'effect_failed',
          effect: effectName,
          workerId: worker,
          claimId,
          errorCode,
        }, fieldValue));
        if (manualReview) {
          transaction.create(alertReceipt, auditReceipt({
            orderId:id,event:'operator_alert',errorCode,
          }, fieldValue));
        }
        return true;
      });
    },

    async recordPendingEffectFailure(descriptor, failure = {}, now = clock()) {
      if (!plainObject(descriptor)) {
        throw repositoryError('ORDER_INVALID', 'Pending effect descriptor is invalid');
      }
      const effectId = requiredId(descriptor.effectId, 'effectId', EFFECT_DOCUMENT_ID);
      const pendingEffect = requiredText(descriptor.effect, 'effect', 64);
      if (pendingEffect !== 'pilot_auth_email' && !EFFECT_TYPES.has(pendingEffect)) {
        throw repositoryError('ORDER_INVALID', 'effect is invalid');
      }
      const orderId = pendingEffect === 'pilot_auth_email'
        ? null
        : requiredId(descriptor.orderId, 'orderId');
      if (pendingEffect === 'pilot_auth_email') recipientBinding(descriptor.recipientBinding);
      const failedAt = dateValue(now, 'now');
      const errorCode = safeErrorCode(failure.code, 'commerce_effect_dispatch_unavailable');
      const forceTerminal = failure.terminal === true;
      const reference = effects.doc(effectId);
      const orderReference = orderId == null ? null : orderRef(orderId);
      const receipt = auditRef();
      const alertReceipt = auditRef();
      return db.runTransaction(async transaction => {
        const [effectSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(reference),
          orderReference == null ? Promise.resolve(null) : transaction.get(orderReference),
        ]);
        if (!effectSnapshot.exists) return false;
        const effect = effectSnapshot.data();
        const identityMatches = effect.effect === pendingEffect
          && (pendingEffect === 'pilot_auth_email'
            ? effectId === `pilot-auth-${recipientBinding(descriptor.recipientBinding)}`
            : effect.orderId === orderId);
        if (!identityMatches) {
          throw repositoryError('ORDER_INVALID', 'Pending effect descriptor is invalid');
        }
        if (effect.status !== 'pending') return false;
        if (effect.nextAttemptAt
          && timestampDate(effect.nextAttemptAt, 'nextAttemptAt') > failedAt) return false;
        const attemptCount = Math.min(Number(effect.attemptCount ?? 0) + 1, 8);
        const terminal = forceTerminal || attemptCount >= 8;
        const retryDelay = Math.min(
          5 * 60 * 1000 * (2 ** (attemptCount - 1)),
          6 * 60 * 60 * 1000
        );
        const nextAttemptAt = terminal
          ? null
          : Timestamp.fromDate(new Date(failedAt.getTime() + retryDelay));
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...effect,
          status:terminal ? 'manual_review' : 'pending',
          claim:null,
          attemptCount,
          lastErrorCode:errorCode,
          nextAttemptAt,
          updatedAt:timestamp,
        });
        if (terminal && orderSnapshot?.exists) {
          const order = orderSnapshot.data();
          transaction.set(orderReference, {
            ...order,
            status:'manual_review',
            terminal:true,
            activeTransition:null,
            reconciliationDueAt:null,
            lastErrorCode:errorCode,
            updatedAt:timestamp,
          });
        }
        transaction.create(receipt, effectReceipt({
          orderId,
          event:terminal ? 'effect_manual_review' : 'effect_failed',
          effect:pendingEffect,
          errorCode,
        }, fieldValue));
        if (terminal) {
          transaction.create(alertReceipt, auditReceipt({
            orderId,event:'operator_alert',errorCode,
          }, fieldValue));
        }
        return true;
      });
    },

    async listDueEffects(now = clock(), {limit = 50} = {}) {
      const maximum = Number(limit);
      if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100) {
        throw repositoryError('ORDER_INVALID', 'limit is invalid');
      }
      const cutoff = Timestamp.fromDate(dateValue(now, 'now'));
      const snapshot = await effects
        .where('status', '==', 'pending')
        .where('nextAttemptAt', '<=', cutoff)
        .orderBy('nextAttemptAt', 'asc')
        .limit(maximum)
        .get();
      return Object.freeze(snapshot.docs.map(document => {
        const effect = document.data();
        if (effect.effect === 'pilot_auth_email') {
          return Object.freeze({
            effectId:document.id,
            effect:effect.effect,
            recipientBinding:recipientBinding(document.id.slice('pilot-auth-'.length)),
          });
        }
        return Object.freeze({
          effectId:document.id,
          effect:effectType(effect.effect),
          orderId:requiredId(effect.orderId, 'orderId'),
        });
      }));
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
        recoveredPublicAuthBindings: [],
        recoveredSendOrderIds: [],
        manualReviewOrderIds: [],
        manualReviewPilotAuthBindings: [],
        manualReviewPublicAuthBindings: [],
      };
      for (const document of snapshot.docs) {
        const reference = effects.doc(document.id);
        const alertReceipt = auditRef();
        const outcome = await db.runTransaction(async transaction => {
          const current = await transaction.get(reference);
          if (!current.exists) return null;
          const effect = current.data();
          if (effect.status !== 'claimed'
            || timestampDate(effect.claim?.leaseExpiresAt, 'leaseExpiresAt') > dateValue(now, 'now')) return null;
          const timestamp = fieldValue.serverTimestamp();
          if (effect.effect === 'pilot_auth_email') {
            const binding = document.id.slice('pilot-auth-'.length);
            if (effect.dispatchStartedAt == null && effect.dispatchAttemptCount === 0) {
              transaction.set(reference, {
                ...effect, status: 'pending', claim: null,
                lastErrorCode: effect.lastErrorCode, nextAttemptAt:cutoff, updatedAt: timestamp,
              });
              return {kind:'recovered_auth',id:binding};
            }
            transaction.set(reference, {
              ...effect, status: 'manual_review', claim: null,
              lastClaimId: effect.claim?.claimId,
              lastErrorCode: 'pilot_auth_email_unknown', nextAttemptAt:null, updatedAt: timestamp,
            });
            transaction.create(alertReceipt, auditReceipt({
              event:'operator_alert',errorCode:'pilot_auth_email_unknown',
            }, fieldValue));
            return {kind:'manual_auth',id:binding};
          }
          if (effect.effect === PUBLIC_AUTH_EFFECT) {
            const binding = document.id.slice('public-auth-'.length);
            if (!SHA256_DIGEST.test(binding)) return null;
            if (effect.dispatchStartedAt == null && effect.dispatchAttemptCount === 0) {
              transaction.set(reference, {
                ...effect,cleanupEligible:true,status:'pending',claim:null,
                nextAttemptAt:Timestamp.fromDate(PUBLIC_AUTH_NO_BACKGROUND_DISPATCH_AT),updatedAt:timestamp,
              });
              return {kind:'recovered_public_auth',id:binding};
            }
            transaction.set(reference, {
              ...effect,cleanupEligible:false,status:'manual_review',claim:null,lastClaimId:effect.claim?.claimId,
              lastErrorCode:'public_digital_auth_email_unknown',nextAttemptAt:null,updatedAt:timestamp,
            });
            if (SHA256_DIGEST.test(effect.quarantineBinding)) {
              transaction.set(publicAuthQuarantineRef(effect.quarantineBinding),{
                publicAuth:true,active:true,reasonCode:'public_digital_auth_email_unknown',
                effectId:document.id,createdAt:timestamp,updatedAt:timestamp,
              });
            }
            transaction.set(publicAuthAuditRef(binding),publicAuthAuditReceipt(binding,{
              event:'operator_alert',errorCode:'public_digital_auth_email_unknown',
            },now));
            return {kind:'manual_public_auth',id:binding};
          }
          if (effect.effect === 'invoice_create') {
            transaction.set(reference, {
              ...effect, status: 'pending', claim: null,
              lastErrorCode: effect.lastErrorCode, nextAttemptAt: cutoff, updatedAt: timestamp,
            });
            return {kind:'recovered_create',id:effect.orderId};
          }
          if (effect.effect === 'invoice_send') {
            const orderReference = orderRef(effect.orderId);
            const orderSnapshot = await transaction.get(orderReference);
            transaction.set(reference, {
              ...effect, status: 'manual_review', claim: null,
              lastClaimId: effect.claim?.claimId,
              lastErrorCode: 'invoice_send_unknown', nextAttemptAt: null, updatedAt: timestamp,
            });
            if (orderSnapshot.exists) {
              const order = orderSnapshot.data();
              transaction.set(orderReference, {
                ...order, status: 'manual_review', terminal: true, activeTransition: null,
                reconciliationDueAt: null, lastErrorCode: 'invoice_send_unknown', updatedAt: timestamp,
              });
            }
            transaction.create(alertReceipt, auditReceipt({
              orderId:effect.orderId,event:'operator_alert',errorCode:'invoice_send_unknown',
            }, fieldValue));
            return {kind:'manual_send',id:effect.orderId};
          }
          return null;
        });
        if (outcome?.kind === 'recovered_auth') recovered.recoveredPilotAuthBindings.push(outcome.id);
        if (outcome?.kind === 'manual_auth') recovered.manualReviewPilotAuthBindings.push(outcome.id);
        if (outcome?.kind === 'recovered_public_auth') recovered.recoveredPublicAuthBindings.push(outcome.id);
        if (outcome?.kind === 'manual_public_auth') recovered.manualReviewPublicAuthBindings.push(outcome.id);
        if (outcome?.kind === 'recovered_create') recovered.recoveredCreateOrderIds.push(outcome.id);
        if (outcome?.kind === 'recovered_send') recovered.recoveredSendOrderIds.push(outcome.id);
        if (outcome?.kind === 'manual_send') recovered.manualReviewOrderIds.push(outcome.id);
      }
      return Object.freeze({
        recoveredCreateOrderIds: Object.freeze(recovered.recoveredCreateOrderIds),
        recoveredPilotAuthBindings: Object.freeze(recovered.recoveredPilotAuthBindings),
        recoveredPublicAuthBindings: Object.freeze(recovered.recoveredPublicAuthBindings),
        recoveredSendOrderIds: Object.freeze(recovered.recoveredSendOrderIds),
        manualReviewOrderIds: Object.freeze(recovered.manualReviewOrderIds),
        manualReviewPilotAuthBindings: Object.freeze(recovered.manualReviewPilotAuthBindings),
        manualReviewPublicAuthBindings: Object.freeze(recovered.manualReviewPublicAuthBindings),
      });
    },

    async claimPaymentVerification(orderId, workerId, now = clock()) {
      const id = requiredId(orderId, 'orderId');
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(claimIdFactory(), 'claimId');
      const claimedAt = dateValue(now, 'now');
      const leaseExpiresAt = new Date(claimedAt.getTime() + EFFECT_LEASE_MILLISECONDS);
      const reference = orderRef(id);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        if (!PAYMENT_RECOVERY_STATUSES.has(order.status)) return false;
        const currentLease = order.paymentVerificationClaim?.leaseExpiresAt;
        if (currentLease && timestampDate(currentLease, 'leaseExpiresAt') > claimedAt) return false;
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...order,
          activeTransition:null,
          paymentVerificationClaim:{
            claimId,workerId:worker,previousStatus:order.status,
            claimedAt:Timestamp.fromDate(claimedAt),
            leaseExpiresAt:Timestamp.fromDate(leaseExpiresAt),
          },
          terminal:false,
          reconciliationDueAt:Timestamp.fromDate(leaseExpiresAt),
          updatedAt:timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId:id,event:'payment_verification_claimed',workerId:worker,claimId,
        }, fieldValue));
        return Object.freeze({claimId});
      });
    },

    async completeVerifiedDigitalOrder(orderId, workerId, rawClaimId, rawProviderRefs = {}) {
      const id = requiredId(orderId, 'orderId');
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const providerRefs = normalizeProviderRefs(rawProviderRefs);
      if (!Object.hasOwn(providerRefs, 'providerPaymentRef')) {
        throw repositoryError('UNSAFE_PROVIDER_REFS', 'Payment reference is required');
      }
      const reference = orderRef(id);
      const grantReference = fulfillmentGrants.doc(id);
      const receipt = auditRef();
      return db.runTransaction(async transaction => {
        const [snapshot, grantSnapshot] = await Promise.all([
          transaction.get(reference),transaction.get(grantReference),
        ]);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        if (order.status === 'fulfilled' && order.lastPaymentVerificationClaimId === claimId) return false;
        if (order.paymentVerificationClaim?.claimId !== claimId
          || order.paymentVerificationClaim?.workerId !== worker) {
          throw repositoryError('PAYMENT_CLAIM_LOST', 'Payment verification claim is no longer held');
        }
        if (order.orderType !== 'digital_product'
          || typeof order.customerUid !== 'string'
          || order.customerUid.length < 1) {
          throw repositoryError('INVALID_ORDER_TRANSITION', 'Digital fulfillment is not allowed');
        }
        const timestamp = fieldValue.serverTimestamp();
        if (!grantSnapshot.exists) {
          transaction.create(grantReference, {
            orderId:id,sku:order.sku,customerUid:order.customerUid,
            fulfillmentType:order.fulfillmentType,status:'active',createdAt:timestamp,
          });
        }
        transaction.set(reference, {
          ...order,
          status:'fulfilled',terminal:true,activeTransition:null,
          paymentVerificationClaim:null,lastPaymentVerificationClaimId:claimId,
          providerRefs:mergeProviderRefs(order.providerRefs, providerRefs),
          fulfillment:{status:'fulfilled'},lastErrorCode:null,retry:null,
          reconciliationDueAt:null,updatedAt:timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId:id,event:'payment_verified_and_fulfilled',toStatus:'fulfilled',
          workerId:worker,claimId,
        }, fieldValue));
        return true;
      });
    },

    async completeVerifiedServiceOrder(orderId, workerId, rawClaimId, rawProviderRefs = {}) {
      const id=requiredId(orderId,'orderId');
      const worker=requiredId(workerId,'workerId',WORKER_ID);
      const claimId=requiredId(rawClaimId,'claimId');
      const providerRefs=normalizeProviderRefs(rawProviderRefs);
      if (!Object.hasOwn(providerRefs,'providerPaymentRef')) throw repositoryError('UNSAFE_PROVIDER_REFS','Payment reference is required');
      const reference=orderRef(id);
      return db.runTransaction(async transaction=>{
        const snapshot=await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND','Order was not found');
        const order=snapshot.data();
        if (order.status==='paid' && order.lastPaymentVerificationClaimId===claimId) return false;
        if (order.paymentVerificationClaim?.claimId!==claimId || order.paymentVerificationClaim?.workerId!==worker) {
          throw repositoryError('PAYMENT_CLAIM_LOST','Payment verification claim is no longer held');
        }
        if (order.orderType!=='service') throw repositoryError('INVALID_ORDER_TRANSITION','Service payment is not allowed');
        transaction.set(reference,{...order,status:'paid',terminal:false,activeTransition:null,
          paymentVerificationClaim:null,lastPaymentVerificationClaimId:claimId,
          providerRefs:mergeProviderRefs(order.providerRefs,providerRefs),lastErrorCode:null,retry:null,
          reconciliationDueAt:null,updatedAt:fieldValue.serverTimestamp()});
        return true;
      });
    },

    async completePaymentVerification(orderId, workerId, rawClaimId, result = {}) {
      const id = requiredId(orderId, 'orderId');
      const worker = requiredId(workerId, 'workerId', WORKER_ID);
      const claimId = requiredId(rawClaimId, 'claimId');
      const outcome = result.outcome;
      if (!['pending','retry','manual_review'].includes(outcome)) {
        throw repositoryError('ORDER_INVALID', 'Payment verification outcome is invalid');
      }
      const errorCode = result.errorCode == null ? null : safeErrorCode(result.errorCode);
      const retryAt = outcome === 'manual_review'
        ? null
        : Timestamp.fromDate(dateValue(result.retryAt, 'retryAt'));
      const reference = orderRef(id);
      const receipt = auditRef();
      const alertReceipt = auditRef();
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw repositoryError('ORDER_NOT_FOUND', 'Order was not found');
        const order = snapshot.data();
        const claim = order.paymentVerificationClaim;
        if (claim?.claimId !== claimId || claim?.workerId !== worker) {
          throw repositoryError('PAYMENT_CLAIM_LOST', 'Payment verification claim is no longer held');
        }
        const status = outcome === 'manual_review'
          ? 'manual_review'
          : outcome === 'pending'
            ? (order.orderType === 'service' ? 'invoiced' : 'pending_payment')
            : claim.previousStatus;
        const timestamp = fieldValue.serverTimestamp();
        transaction.set(reference, {
          ...order,status,activeTransition:null,paymentVerificationClaim:null,
          terminal:outcome === 'manual_review',
          reconciliationDueAt:retryAt,
          lastErrorCode:errorCode,
          retry:outcome === 'manual_review' ? null : {
            attemptCount:Number(order.retry?.attemptCount ?? 0) + 1,dueAt:retryAt,
          },
          updatedAt:timestamp,
        });
        transaction.create(receipt, auditReceipt({
          orderId:id,event:'payment_verification_completed',toStatus:status,
          workerId:worker,claimId,errorCode,
        }, fieldValue));
        if (outcome === 'manual_review') {
          transaction.create(alertReceipt, auditReceipt({
            orderId:id,event:'operator_alert',errorCode:errorCode ?? 'payment_verification_mismatch',
          }, fieldValue));
        }
        return true;
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

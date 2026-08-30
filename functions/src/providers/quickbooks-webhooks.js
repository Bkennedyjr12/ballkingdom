import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

const ALLOWED_ENTITIES = new Set(['Invoice', 'Payment']);
const ALLOWED_OPERATIONS = new Set(['Create', 'Update', 'Delete', 'Merge', 'Void']);
const IDENTIFIER = /^[A-Za-z0-9._:/-]{1,200}$/;
const MAX_RAW_BODY_BYTES = 256 * 1024;
const MAX_NOTIFICATIONS = 20;
const MAX_ENTITIES = 100;

function webhookError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validSignature(rawBody, signature, verifierToken) {
  if (!Buffer.isBuffer(rawBody)
    || typeof signature !== 'string'
    || signature.length < 1
    || typeof verifierToken !== 'string'
    || verifierToken.length < 1) return false;
  const expected = createHmac('sha256', verifierToken).update(rawBody).digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function normalizeHint(notification, entity, expectedRealmId) {
  if (!isRecord(notification) || notification.realmId !== expectedRealmId) {
    throw webhookError('WEBHOOK_REALM_INVALID', 'QuickBooks webhook realm was rejected');
  }
  if (!isRecord(entity)
    || !ALLOWED_ENTITIES.has(entity.name)
    || typeof entity.id !== 'string'
    || !IDENTIFIER.test(entity.id)
    || !ALLOWED_OPERATIONS.has(entity.operation)
    || typeof entity.lastUpdated !== 'string'
    || Number.isNaN(Date.parse(entity.lastUpdated))) {
    throw webhookError('WEBHOOK_PAYLOAD_INVALID', 'QuickBooks webhook payload was invalid');
  }
  return Object.freeze({
    realmId: expectedRealmId,
    entityName: entity.name,
    entityId: entity.id,
    operation: entity.operation,
    lastUpdated: entity.lastUpdated,
  });
}

function hintId(hint) {
  return createHash('sha256')
    .update(`quickbooks-webhook-hint\0${JSON.stringify(hint)}`)
    .digest('hex');
}

export function createQuickBooksWebhookProcessor({
  verifierToken,
  expectedRealmId,
  storeHints,
} = {}) {
  if (typeof verifierToken !== 'string' || verifierToken.length < 1
    || typeof expectedRealmId !== 'string' || !IDENTIFIER.test(expectedRealmId)
    || typeof storeHints !== 'function') {
    throw new TypeError('QuickBooks webhook dependencies are required');
  }

  return Object.freeze({
    async acceptQuickBooksWebhook({rawBody, signature} = {}) {
      if (!validSignature(rawBody, signature, verifierToken)) {
        throw webhookError('WEBHOOK_SIGNATURE_INVALID', 'QuickBooks webhook signature was rejected');
      }
      if (rawBody.length > MAX_RAW_BODY_BYTES) {
        throw webhookError('WEBHOOK_PAYLOAD_INVALID', 'QuickBooks webhook payload was invalid');
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        throw webhookError('WEBHOOK_PAYLOAD_INVALID', 'QuickBooks webhook payload was invalid');
      }
      if (!isRecord(payload)
        || !Array.isArray(payload.eventNotifications)
        || payload.eventNotifications.length < 1
        || payload.eventNotifications.length > MAX_NOTIFICATIONS) {
        throw webhookError('WEBHOOK_PAYLOAD_INVALID', 'QuickBooks webhook payload was invalid');
      }

      const hints = new Map();
      let entityCount = 0;
      for (const notification of payload.eventNotifications) {
        if (!isRecord(notification) || notification.realmId !== expectedRealmId) {
          throw webhookError('WEBHOOK_REALM_INVALID', 'QuickBooks webhook realm was rejected');
        }
        const entities = notification.dataChangeEvent?.entities;
        if (!Array.isArray(entities)) {
          throw webhookError('WEBHOOK_PAYLOAD_INVALID', 'QuickBooks webhook payload was invalid');
        }
        for (const entity of entities) {
          entityCount += 1;
          if (entityCount > MAX_ENTITIES) {
            throw webhookError('WEBHOOK_PAYLOAD_INVALID', 'QuickBooks webhook payload was invalid');
          }
          if (!isRecord(entity)) {
            throw webhookError('WEBHOOK_PAYLOAD_INVALID', 'QuickBooks webhook payload was invalid');
          }
          if (!ALLOWED_ENTITIES.has(entity.name)) continue;
          const hint = normalizeHint(notification, entity, expectedRealmId);
          hints.set(hintId(hint), hint);
        }
      }

      if (hints.size > 0) {
        await storeHints([...hints].map(([id,hint]) => Object.freeze({id,hint})));
      }
      return Object.freeze({accepted: true});
    },
  });
}

import {createHash, timingSafeEqual, randomUUID} from 'node:crypto';
import {getCommerceItem as getCatalogItem} from './catalog.js';
import {newOrder} from './order-state.js';
import {verifyQuickBooksPaymentEvidence} from './quickbooks-payment-verifier.js';
import {readCommerceFeatureFlags} from './feature-flags.js';

const GENERIC_AUTH_RESULT = Object.freeze({status:'request_received'});
const SAFE_ORDER_RESULT_MESSAGE = 'QuickBooks sent payment instructions to your email.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RECONCILIATION_LIMIT = 50;
const RECONCILIATION_HINT_TTL_MS = 24 * 60 * 60 * 1000;

function commerceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizedEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.normalize('NFKC').trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

function comparisonDigest(email) {
  return createHash('sha256').update(`compare\0${email}`).digest();
}

function recipientBinding(email) {
  return createHash('sha256').update(`binding\0${email}`).digest('hex');
}

function rateLimitKey(value) {
  return createHash('sha256').update(`rate\0${value}`).digest('hex');
}

function approvedRecipient(candidate, approved) {
  const candidateDigest = comparisonDigest(candidate);
  const approvedDigest = comparisonDigest(approved);
  return candidateDigest.length === approvedDigest.length
    && timingSafeEqual(candidateDigest, approvedDigest);
}

function requireApprovedEmail(getApprovedPilotEmail) {
  const approved = normalizedEmail(getApprovedPilotEmail());
  if (!approved) throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
  return approved;
}

function authIdentity(authContext) {
  const uid = authContext?.uid;
  const email = normalizedEmail(authContext?.email ?? authContext?.token?.email);
  const emailVerified = authContext?.emailVerified ?? authContext?.token?.email_verified;
  if (typeof uid !== 'string' || uid.length < 1) {
    throw commerceError('AUTH_REQUIRED', 'Authentication is required');
  }
  if (!email || emailVerified !== true) {
    throw commerceError('VERIFIED_EMAIL_REQUIRED', 'A verified email is required');
  }
  return {uid,email};
}

async function authoritativeIdentity(authContext, getCurrentUser) {
  const identity = authIdentity(authContext);
  if (typeof getCurrentUser !== 'function') {
    throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
  }
  let user;
  try {
    user = await getCurrentUser(identity.uid);
  } catch {
    throw commerceError('AUTH_SESSION_INVALID', 'Authentication is no longer valid');
  }
  const currentEmail = normalizedEmail(user?.email);
  const authTime = Number(authContext?.token?.auth_time);
  const validAfter = Date.parse(user?.tokensValidAfterTime ?? '');
  if (user?.uid !== identity.uid
    || user.disabled === true
    || user.emailVerified !== true
    || currentEmail !== identity.email
    || !Number.isInteger(authTime)
    || !Number.isFinite(validAfter)
    || authTime * 1000 < validAfter) {
    throw commerceError('AUTH_SESSION_INVALID', 'Authentication is no longer valid');
  }
  return Object.freeze({...identity,authorizedRecipientBinding:recipientBinding(currentEmail)});
}

function safeOrderStatus(status) {
  if (['pending_payment','payment_verifying','invoiced','invoice_processing'].includes(status)) {
    return 'payment_verification_pending';
  }
  return status;
}

function isExactlyUnpaid(evidence, order) {
  const invoice = evidence?.invoice;
  return evidence?.realmId === order.providerRefs.realmId
    && invoice?.invoiceId === order.providerRefs.invoiceId
    && invoice?.providerOrderRef === order.providerRefs.providerOrderRef
    && invoice?.totalAmountCents === order.amountCents
    && invoice?.balanceCents === order.amountCents
    && invoice?.currency === order.currency
    && invoice?.entityState === 'present'
    && invoice?.paymentState === 'unpaid'
    && Array.isArray(evidence?.payments)
    && evidence.payments.length === 0;
}

function isExactBoundInvoice(evidence, order) {
  const invoice = evidence?.invoice;
  return evidence?.realmId === order.providerRefs.realmId
    && invoice?.invoiceId === order.providerRefs.invoiceId
    && invoice?.providerOrderRef === `bk-order-${order.id}`
    && invoice?.providerOrderRef === order.providerRefs.providerOrderRef
    && invoice?.totalAmountCents === order.amountCents
    && invoice?.currency === order.currency
    && invoice?.entityState === 'present';
}

function retryAt(order, now) {
  const attempt = Math.min(Number(order.retry?.attemptCount ?? 0), 7);
  const delay = Math.min(5 * 60 * 1000 * (2 ** attempt), 6 * 60 * 60 * 1000);
  return new Date(now.getTime() + delay);
}

function validOrderInput(input) {
  return record(input)
    && typeof input.sku === 'string'
    && input.sku.length > 0
    && input.sku.length <= 128
    && input.sku === input.sku.trim()
    && typeof input.customerName === 'string'
    && input.customerName.trim().length > 0
    && input.customerName.trim().length <= 200
    && typeof input.idempotencyKey === 'string'
    && SAFE_IDEMPOTENCY_KEY.test(input.idempotencyKey);
}

export function createCommerceService({
  repository,
  quickbooks,
  graph,
  auth,
  getCommerceItem = getCatalogItem,
  readFeatureFlags: readFlags = readCommerceFeatureFlags,
  getApprovedPilotEmail,
  getCurrentUser,
  fulfillDigitalOrder = async () => ({fulfilled:true}),
  alertOperator = async () => {},
  authRequestLimiter = async () => true,
  statusRequestLimiter = async () => true,
  idFactory = randomUUID,
  workerIdFactory = purpose => `${purpose}-${randomUUID()}`,
  clock = () => new Date(),
  sleep = () => new Promise(resolve => setTimeout(resolve, 25)),
  actionCodeSettings = Object.freeze({
    url:'https://ballkingdom.com/finish-sign-in',
    handleCodeInApp:true,
  }),
} = {}) {
  if (!repository || typeof readFlags !== 'function' || typeof getApprovedPilotEmail !== 'function'
    || typeof getCommerceItem !== 'function' || typeof idFactory !== 'function'
    || typeof workerIdFactory !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Commerce service dependencies are required');
  }

  async function waitForEffect(orderId, effectName) {
    if (typeof repository.getEffect !== 'function') return null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const effect = await repository.getEffect(orderId, effectName);
      if (!effect || effect.status !== 'claimed') return effect;
      await sleep();
    }
    return repository.getEffect(orderId, effectName);
  }

  async function dispatchPilotAuthEmail(approvedEmail, binding) {
    if (!auth?.generateSignInWithEmailLink || !graph?.sendPilotAuthLink) {
      throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
    }
    const workerId = workerIdFactory('pilot-auth-email');
    const claim = await repository.claimPilotAuthEmailEffect(binding, workerId, clock());
    if (!claim) return false;

    let link;
    try {
      link = await auth.generateSignInWithEmailLink(approvedEmail, actionCodeSettings);
    } catch {
      await repository.recordPilotAuthEmailFailure(
        binding, workerId, claim.claimId, {code:'pilot_auth_link_generation_failed'}
      );
      return false;
    }

    await repository.markPilotAuthDispatchStarted(binding, workerId, claim.claimId, clock());
    try {
      await graph.sendPilotAuthLink({to:approvedEmail,link});
    } catch {
      await repository.recordPilotAuthEmailFailure(
        binding, workerId, claim.claimId, {code:'pilot_auth_email_unknown'}
      );
      return false;
    }
    await repository.completePilotAuthEmailEffect(binding, workerId, claim.claimId);
    return true;
  }

  async function resumeDigitalInvoice(orderId, approvedEmail) {
    if (!quickbooks?.createCommerceInvoice || !quickbooks?.sendInvoice || !quickbooks?.getInvoice) {
      throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
    }
    let order = await repository.getOrder(orderId);
    if (!order) throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
    const ephemeralEmail = normalizedEmail(approvedEmail);
    if (!ephemeralEmail
      || order.authorizedRecipientBinding !== recipientBinding(ephemeralEmail)) {
      throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
    }
    if (order.status === 'manual_review') {
      throw commerceError('ORDER_MANUAL_REVIEW', 'Order requires administrator review');
    }

    const createWorker = workerIdFactory('invoice-create');
    const createClaim = await repository.claimEffect(orderId, 'invoice_create', createWorker, clock());
    if (createClaim) {
      let created;
      let readback;
      try {
        if (order.providerRefs?.invoiceId) {
          readback = await quickbooks.getInvoice(order.providerRefs.invoiceId);
          if (!isExactBoundInvoice(readback, order)
            || typeof order.providerRefs.customerId !== 'string'
            || order.providerRefs.customerId.length < 1) {
            throw commerceError('INVOICE_READBACK_INVALID', 'Invoice readback was invalid');
          }
          created = {
            invoiceId:order.providerRefs.invoiceId,
            customerId:order.providerRefs.customerId,
          };
        } else {
          created = await quickbooks.createCommerceInvoice({
            ...order,
            customer:{...order.customer,email:ephemeralEmail},
          });
          readback = await quickbooks.getInvoice(created.invoiceId);
          if (readback?.invoice?.invoiceId !== created.invoiceId
            || readback.invoice.providerOrderRef !== `bk-order-${orderId}`
            || readback.invoice.totalAmountCents !== order.amountCents
            || readback.invoice.currency !== order.currency
            || readback.invoice.entityState !== 'present'
            || typeof created.customerId !== 'string'
            || created.customerId.length < 1
            || typeof readback.realmId !== 'string'
            || readback.realmId.length < 1) {
            throw commerceError('INVOICE_READBACK_INVALID', 'Invoice readback was invalid');
          }
        }
      } catch (error) {
        if (error?.code !== 'PROVIDER_TIMEOUT') {
          await repository.recordEffectFailure(
            orderId, 'invoice_create', createWorker, createClaim.claimId,
            {code:'invoice_create_failed'}, clock()
          );
        }
        throw commerceError('ORDER_PROCESSING_PENDING', 'Order processing is pending');
      }
      await repository.completeEffect(
        orderId, 'invoice_create', createWorker, createClaim.claimId,
        {providerRefs:{
          realmId:readback.realmId,
          invoiceId:created.invoiceId,
          customerId:created.customerId,
          providerOrderRef:readback.invoice.providerOrderRef,
        }}
      );
    } else {
      const effect = await waitForEffect(orderId, 'invoice_create');
      if (effect && effect.status !== 'completed') {
        throw commerceError('ORDER_PROCESSING_PENDING', 'Order processing is pending');
      }
    }

    order = await repository.getOrder(orderId);
    if (order.status === 'manual_review') {
      throw commerceError('ORDER_MANUAL_REVIEW', 'Order requires administrator review');
    }
    const sendWorker = workerIdFactory('invoice-send');
    const sendClaim = await repository.claimEffect(orderId, 'invoice_send', sendWorker, clock());
    if (sendClaim) {
      await repository.markEffectDispatchStarted(
        orderId, 'invoice_send', sendWorker, sendClaim.claimId, clock()
      );
      try {
        const sent = await quickbooks.sendInvoice({
          invoiceId:order.providerRefs.invoiceId,
          customerEmail:ephemeralEmail,
        });
        if (sent?.sendAccepted !== true || sent.invoiceId !== order.providerRefs.invoiceId) {
          throw commerceError('INVOICE_SEND_INVALID', 'Invoice send result was invalid');
        }
      } catch {
        await repository.recordEffectFailure(
          orderId, 'invoice_send', sendWorker, sendClaim.claimId,
          {code:'invoice_send_unknown'}, clock()
        );
        throw commerceError('ORDER_MANUAL_REVIEW', 'Order requires administrator review');
      }
      await repository.completeEffect(orderId, 'invoice_send', sendWorker, sendClaim.claimId);
    } else {
      const effect = await waitForEffect(orderId, 'invoice_send');
      if (effect?.status === 'manual_review') {
        throw commerceError('ORDER_MANUAL_REVIEW', 'Order requires administrator review');
      }
      if (effect && effect.status !== 'completed') {
        throw commerceError('ORDER_PROCESSING_PENDING', 'Order processing is pending');
      }
    }
    order = await repository.getOrder(orderId);
    if (order.status === 'manual_review') {
      throw commerceError('ORDER_MANUAL_REVIEW', 'Order requires administrator review');
    }
    return order;
  }

  async function dispatchPendingEffectsInternal(at) {
    const recovered = await repository.recoverExpiredEffects(at);
    const flags = readFlags();
    const dueEffects = await repository.listDueEffects(at, {limit:RECONCILIATION_LIMIT});
    if (flags.digitalInvoicePilotEnabled === true) {
      let approved;
      const loadApproved = () => {
        approved ??= requireApprovedEmail(getApprovedPilotEmail);
        return approved;
      };
      const processedOrders = new Set();
      for (const effect of dueEffects) {
        try {
          if (effect.effect === 'pilot_auth_email') {
            const email = loadApproved();
            if (effect.recipientBinding !== recipientBinding(email)) {
              await repository.recordPendingEffectFailure(effect, {
                code:'pilot_auth_recipient_mismatch',terminal:true,
              }, at);
              continue;
            }
            await dispatchPilotAuthEmail(email, effect.recipientBinding);
            continue;
          }
          if (processedOrders.has(effect.orderId)) continue;
          const order = await repository.getOrder(effect.orderId);
          if (!order) {
            await repository.recordPendingEffectFailure(effect, {
              code:'commerce_effect_order_missing',terminal:true,
            }, at);
            continue;
          }
          const email = loadApproved();
          if (order.authorizedRecipientBinding !== recipientBinding(email)) {
            await repository.recordPendingEffectFailure(effect, {
              code:'authorized_recipient_binding_mismatch',terminal:true,
            }, at);
            continue;
          }
          await resumeDigitalInvoice(effect.orderId, email);
          processedOrders.add(effect.orderId);
        } catch (error) {
          if (error?.code === 'ORDER_MANUAL_REVIEW') {
            await repository.recordPendingEffectFailure(effect, {
              code:'commerce_effect_order_manual_review',terminal:true,
            }, at);
          } else if (error?.code !== 'ORDER_PROCESSING_PENDING') {
            await repository.recordPendingEffectFailure(effect, {
              code:'commerce_effect_dispatch_unavailable',terminal:false,
            }, at);
          }
        }
      }
    }
    return recovered;
  }

  return Object.freeze({
    async requestPilotSignInLink(input, appCheckContext) {
      if (!appCheckContext?.app) throw commerceError('APP_CHECK_REQUIRED', 'App Check is required');
      if (!record(input) || Object.keys(input).some(key => key !== 'email')) return GENERIC_AUTH_RESULT;
      const candidate = normalizedEmail(input.email);
      if (!candidate) return GENERIC_AUTH_RESULT;
      const approved = requireApprovedEmail(getApprovedPilotEmail);
      if (!approvedRecipient(candidate, approved)) return GENERIC_AUTH_RESULT;
      if (!(await authRequestLimiter(rateLimitKey('pilot-auth-approved')))) return GENERIC_AUTH_RESULT;
      const flags = readFlags();
      if (flags.digitalInvoicePilotEnabled !== true) {
        await repository.recordPilotAuthRequestAllowedDisabled();
        return GENERIC_AUTH_RESULT;
      }
      const binding = recipientBinding(approved);
      await repository.createPilotAuthEmailEffect(binding);
      await dispatchPilotAuthEmail(approved, binding);
      return GENERIC_AUTH_RESULT;
    },

    async createDigitalOrder(input, authContext) {
      const flags = readFlags();
      if (flags.digitalInvoicePilotEnabled !== true) {
        throw commerceError('COMMERCE_DISABLED', 'Digital ordering is unavailable');
      }
      const identity = await authoritativeIdentity(authContext, getCurrentUser);
      const approved = requireApprovedEmail(getApprovedPilotEmail);
      if (!approvedRecipient(identity.email, approved)) {
        throw commerceError('PILOT_RECIPIENT_REQUIRED', 'Digital ordering is unavailable');
      }
      if (identity.authorizedRecipientBinding !== recipientBinding(approved)) {
        throw commerceError('AUTH_SESSION_INVALID', 'Authentication is no longer valid');
      }
      if (!validOrderInput(input)) throw commerceError('ORDER_INVALID', 'Order input is invalid');
      const item = getCommerceItem(input.sku);
      if (item.orderType !== 'digital_product') {
        throw commerceError('DIGITAL_PRODUCT_REQUIRED', 'Digital product ordering is required');
      }
      const order = {
        ...newOrder({item,customer:{name:input.customerName.trim()}}),
        customerUid:identity.uid,
        authorizedRecipientBinding:identity.authorizedRecipientBinding,
      };
      const reservation = await repository.createReservedDigitalOrder({
        recipientBinding:recipientBinding(approved),
        orderId:idFactory(),
        order,
      });
      await resumeDigitalInvoice(reservation.orderId, approved);
      const stored = await repository.getOrder(reservation.orderId);
      return Object.freeze({
        orderHandle:reservation.orderId,
        amountCents:stored.amountCents,
        currency:stored.currency,
        status:'payment_verification_pending',
        message:SAFE_ORDER_RESULT_MESSAGE,
      });
    },

    async getOrderStatus(input = {}, authContext) {
      const tokenIdentity = authIdentity(authContext);
      if (!(await statusRequestLimiter(rateLimitKey(tokenIdentity.uid)))) {
        throw commerceError('RATE_LIMITED', 'Status request limit reached');
      }
      const identity = await authoritativeIdentity(authContext, getCurrentUser);
      const orderHandle = record(input) ? input.orderHandle : undefined;
      if (typeof orderHandle !== 'string' || orderHandle.length < 1 || orderHandle.length > 128) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      }
      const order = await repository.getOrder(orderHandle);
      if (!order || order.customerUid !== identity.uid) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      }
      if (order.authorizedRecipientBinding != null
        && order.authorizedRecipientBinding !== identity.authorizedRecipientBinding) {
        throw commerceError('AUTH_SESSION_INVALID', 'Authentication is no longer valid');
      }
      return Object.freeze({
        orderHandle,
        amountCents:order.amountCents,
        currency:order.currency,
        status:safeOrderStatus(order.status),
      });
    },

    async verifyOrderPayment({orderId, source} = {}) {
      if (!['scheduled','webhook_hint','admin'].includes(source)) {
        throw commerceError('ORDER_INVALID', 'Payment verification source is invalid');
      }
      let order = await repository.getOrder(orderId);
      if (!order) throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      if (order.status === 'fulfilled' || order.status === 'manual_review') {
        return Object.freeze({status:safeOrderStatus(order.status)});
      }
      if (!['pending_payment','payment_verifying','paid','fulfilling'].includes(order.status)
        || !order.providerRefs?.invoiceId) {
        return Object.freeze({status:safeOrderStatus(order.status)});
      }
      const workerId = workerIdFactory('payment-verification');
      const verifying = await repository.claimPaymentVerification(orderId, workerId, clock());
      if (!verifying) {
        order = await repository.getOrder(orderId);
        return Object.freeze({status:safeOrderStatus(order.status)});
      }
      let evidence;
      try {
        evidence = await quickbooks.getInvoice(order.providerRefs.invoiceId);
      } catch {
        await repository.completePaymentVerification(orderId, workerId, verifying.claimId, {
          outcome:'retry',errorCode:'payment_evidence_unavailable',retryAt:retryAt(order, clock()),
        });
        return Object.freeze({status:'payment_verification_pending'});
      }

      try {
        const verified = verifyQuickBooksPaymentEvidence(evidence, {
          realmId:order.providerRefs.realmId,
          invoiceId:order.providerRefs.invoiceId,
          providerOrderRef:order.providerRefs.providerOrderRef,
          amountCents:order.amountCents,
          currency:order.currency,
        });
        await repository.completeVerifiedDigitalOrder(orderId, workerId, verifying.claimId, {
          realmId:verified.realmId,
          providerOrderRef:verified.providerOrderRef,
          providerPaymentRef:verified.providerPaymentRef,
        });
        return Object.freeze({status:'fulfilled'});
      } catch (error) {
        if (error?.code !== 'PAYMENT_VERIFICATION_MISMATCH') throw error;
      }

      if (isExactlyUnpaid(evidence, order) && ['pending_payment','payment_verifying'].includes(order.status)) {
        await repository.completePaymentVerification(orderId, workerId, verifying.claimId, {
          outcome:'pending',retryAt:retryAt(order, clock()),
        });
        return Object.freeze({status:'payment_verification_pending'});
      }
      await repository.completePaymentVerification(orderId, workerId, verifying.claimId, {
        outcome:'manual_review',errorCode:'payment_verification_mismatch',
      });
      return Object.freeze({status:'manual_review'});
    },

    async reconcilePendingOrders(now = clock()) {
      const at = new Date(now);
      if (Number.isNaN(at.getTime())) throw commerceError('ORDER_INVALID', 'Reconciliation time is invalid');
      const recovered = await dispatchPendingEffectsInternal(at);

      await repository.purgeExpiredWebhookHints(at, {
        limit:RECONCILIATION_LIMIT,ttlMs:RECONCILIATION_HINT_TTL_MS,
      });
      const hints = await repository.listReconciliationHints(at, {
        limit:RECONCILIATION_LIMIT,ttlMs:RECONCILIATION_HINT_TTL_MS,
      });
      const prioritized = new Map();
      const mappedHints = new Map();
      const resolveInvoice = async (realmId, invoiceId) => {
        const order = await repository.findOrderByInvoiceId(realmId, invoiceId);
        return order ? [order] : [];
      };
      const resolveEntity = async ({realmId,entityName,entityId}) => {
        if (entityName === 'Invoice') {
          return resolveInvoice(realmId, entityId);
        }
        const resolved = new Map();
        if (entityName === 'Payment' && quickbooks?.getPayment) {
          const payment = await quickbooks.getPayment(entityId);
          for (const application of payment.applications.slice(0, 10)) {
            if (application.linkedTxnType === 'Invoice') {
              for (const order of await resolveInvoice(realmId, application.linkedTxnId)) {
                resolved.set(order.id, order);
              }
            }
          }
        }
        return [...resolved.values()];
      };
      const addResolved = (orders, source) => {
        const newOrders = orders.filter(order => !prioritized.has(order.id));
        if (newOrders.length > RECONCILIATION_LIMIT - prioritized.size) return false;
        for (const order of newOrders) prioritized.set(order.id, {order,source});
        return true;
      };
      for (const hint of hints) {
        try {
          const orders = await resolveEntity(hint);
          if (addResolved(orders, 'webhook_hint')) {
            mappedHints.set(hint.hintId, new Set(orders.map(order => order.id)));
          }
        } catch {
          await alertOperator({code:'quickbooks_hint_unavailable'});
        }
      }

      if (prioritized.size < RECONCILIATION_LIMIT && quickbooks?.getAccountingChanges) {
        try {
          const changes = await quickbooks.getAccountingChanges({
            changedSince:new Date(at.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          });
          for (const change of changes.changes.slice(0, RECONCILIATION_LIMIT)) {
            const orders = await resolveEntity({
              realmId:changes.realmId,
              entityName:change.entityType,
              entityId:change.entityId,
            });
            if (!addResolved(orders, 'scheduled')) break;
            if (prioritized.size >= RECONCILIATION_LIMIT) break;
          }
        } catch {
          await alertOperator({code:'quickbooks_cdc_unavailable'});
        }
      }

      if (prioritized.size < RECONCILIATION_LIMIT) {
        const candidates = await repository.listReconciliationCandidates(at, {
          limit:RECONCILIATION_LIMIT - prioritized.size,
        });
        for (const candidate of candidates) {
          if (!prioritized.has(candidate.id)) prioritized.set(candidate.id, {order:candidate,source:'scheduled'});
          if (prioritized.size >= RECONCILIATION_LIMIT) break;
        }
      }
      let verified = 0;
      const processedOrderIds = new Set();
      for (const {order:candidate,source} of prioritized.values()) {
        if (!candidate.providerRefs?.invoiceId) {
          continue;
        }
        await this.verifyOrderPayment({orderId:candidate.id,source});
        processedOrderIds.add(candidate.id);
        verified += 1;
      }
      const consumedHintIds = [...mappedHints]
        .filter(([,orderIds]) => [...orderIds].every(orderId => processedOrderIds.has(orderId)))
        .map(([hintId]) => hintId);
      if (consumedHintIds.length > 0) {
        await repository.consumeReconciliationHints(consumedHintIds);
      }
      return Object.freeze({
        recoveredCreateCount:recovered.recoveredCreateOrderIds.length,
        manualReviewCount:recovered.manualReviewOrderIds.length
          + recovered.manualReviewPilotAuthBindings.length,
        reconciliationCandidateCount:prioritized.size,
        verifiedCount:verified,
      });
    },

    async dispatchPendingEffects(now = clock()) {
      const at = new Date(now);
      if (Number.isNaN(at.getTime())) throw commerceError('ORDER_INVALID', 'Dispatch time is invalid');
      const recovered = await dispatchPendingEffectsInternal(at);
      return Object.freeze({
        recoveredCreateCount:recovered.recoveredCreateOrderIds.length,
        recoveredSendCount:recovered.recoveredSendOrderIds.length,
        manualReviewCount:recovered.manualReviewOrderIds.length
          + recovered.manualReviewPilotAuthBindings.length,
      });
    },

    async getCommerceReleaseState(authContext) {
      if (!authContext?.app) throw commerceError('APP_CHECK_REQUIRED', 'App Check is required');
      if (typeof authContext.uid !== 'string' || authContext.uid.length < 1
        || (authContext.admin ?? authContext.token?.admin) !== true) {
        throw commerceError('ADMIN_REQUIRED', 'An administrator is required');
      }
      const flags = readFlags();
      return Object.freeze({
        digitalInvoicePilotEnabled:flags.digitalInvoicePilotEnabled,
        serviceQboSendEnabled:flags.serviceQboSendEnabled,
      });
    },
  });
}

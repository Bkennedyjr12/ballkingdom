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
      await alertOperator({code:'pilot_auth_email_unknown'});
      return false;
    }
    await repository.completePilotAuthEmailEffect(binding, workerId, claim.claimId);
    return true;
  }

  async function resumeDigitalInvoice(orderId) {
    if (!quickbooks?.createCommerceInvoice || !quickbooks?.sendInvoice || !quickbooks?.getInvoice) {
      throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
    }
    let order = await repository.getOrder(orderId);
    if (!order) throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
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
          created = await quickbooks.createCommerceInvoice(order);
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
          customerEmail:order.customer.email,
        });
        if (sent?.sendAccepted !== true || sent.invoiceId !== order.providerRefs.invoiceId) {
          throw commerceError('INVOICE_SEND_INVALID', 'Invoice send result was invalid');
        }
      } catch {
        await repository.recordEffectFailure(
          orderId, 'invoice_send', sendWorker, sendClaim.claimId,
          {code:'invoice_send_unknown'}, clock()
        );
        await alertOperator({code:'invoice_send_unknown',orderId});
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

  async function fulfillOnce(orderId) {
    let order = await repository.getOrder(orderId);
    if (order.status === 'fulfilled') return order;
    if (order.status !== 'paid') return order;
    const workerId = workerIdFactory('digital-fulfillment');
    const fulfilling = await repository.claimTransition(orderId, 'fulfilling', workerId);
    if (!fulfilling) return repository.getOrder(orderId);
    try {
      await fulfillDigitalOrder(order);
    } catch {
      await repository.recordFailure(
        orderId, 'fulfilling', workerId, fulfilling.claimId,
        {code:'fulfillment_failed',retryAt:retryAt(order, clock())}
      );
      return repository.getOrder(orderId);
    }
    await repository.completeTransition(orderId, 'fulfilling', workerId, fulfilling.claimId);
    const fulfilled = await repository.claimTransition(orderId, 'fulfilled', workerId);
    if (fulfilled) {
      await repository.completeTransition(orderId, 'fulfilled', workerId, fulfilled.claimId);
    }
    return repository.getOrder(orderId);
  }

  return Object.freeze({
    async requestPilotSignInLink(input, appCheckContext) {
      if (!appCheckContext?.app) throw commerceError('APP_CHECK_REQUIRED', 'App Check is required');
      if (!record(input) || Object.keys(input).some(key => key !== 'email')) return GENERIC_AUTH_RESULT;
      const candidate = normalizedEmail(input.email);
      if (!candidate || !(await authRequestLimiter(rateLimitKey(candidate)))) {
        return GENERIC_AUTH_RESULT;
      }
      const approved = requireApprovedEmail(getApprovedPilotEmail);
      if (!approvedRecipient(candidate, approved)) return GENERIC_AUTH_RESULT;
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
      const identity = authIdentity(authContext);
      const approved = requireApprovedEmail(getApprovedPilotEmail);
      if (!approvedRecipient(identity.email, approved)) {
        throw commerceError('PILOT_RECIPIENT_REQUIRED', 'Digital ordering is unavailable');
      }
      if (!validOrderInput(input)) throw commerceError('ORDER_INVALID', 'Order input is invalid');
      const item = getCommerceItem(input.sku);
      if (item.orderType !== 'digital_product') {
        throw commerceError('DIGITAL_PRODUCT_REQUIRED', 'Digital product ordering is required');
      }
      const order = {
        ...newOrder({item,customer:{name:input.customerName.trim(),email:identity.email}}),
        customerUid:identity.uid,
      };
      const reservation = await repository.createReservedDigitalOrder({
        recipientBinding:recipientBinding(approved),
        orderId:idFactory(),
        order,
      });
      await resumeDigitalInvoice(reservation.orderId);
      const stored = await repository.getOrder(reservation.orderId);
      return Object.freeze({
        orderHandle:reservation.orderId,
        amountCents:stored.amountCents,
        currency:stored.currency,
        status:'payment_verification_pending',
        message:SAFE_ORDER_RESULT_MESSAGE,
      });
    },

    async getOrderStatus({orderHandle} = {}, authContext) {
      const identity = authIdentity(authContext);
      if (!(await statusRequestLimiter(rateLimitKey(identity.uid)))) {
        throw commerceError('RATE_LIMITED', 'Status request limit reached');
      }
      if (typeof orderHandle !== 'string' || orderHandle.length < 1 || orderHandle.length > 128) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      }
      const order = await repository.getOrder(orderHandle);
      if (!order || order.customerUid !== identity.uid) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
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
      if (order.status === 'paid') {
        order = await fulfillOnce(orderId);
        return Object.freeze({status:safeOrderStatus(order.status)});
      }
      if (order.status !== 'pending_payment' || !order.providerRefs?.invoiceId) {
        return Object.freeze({status:safeOrderStatus(order.status)});
      }
      const workerId = workerIdFactory('payment-verification');
      const verifying = await repository.claimTransition(orderId, 'payment_verifying', workerId);
      if (!verifying) {
        order = await repository.getOrder(orderId);
        return Object.freeze({status:safeOrderStatus(order.status)});
      }
      let evidence;
      try {
        evidence = await quickbooks.getInvoice(order.providerRefs.invoiceId);
      } catch {
        await repository.recordFailure(
          orderId, 'payment_verifying', workerId, verifying.claimId,
          {code:'payment_evidence_unavailable',retryAt:retryAt(order, clock())}
        );
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
        await repository.completeTransition(
          orderId, 'payment_verifying', workerId, verifying.claimId,
          {reconciliationDueAt:clock()}
        );
        const paid = await repository.claimTransition(orderId, 'paid', workerId);
        if (paid) {
          await repository.completeTransition(orderId, 'paid', workerId, paid.claimId, {
            providerRefs:{
              realmId:verified.realmId,
              providerOrderRef:verified.providerOrderRef,
              providerPaymentRef:verified.providerPaymentRef,
            },
          });
        }
        order = await fulfillOnce(orderId);
        return Object.freeze({status:safeOrderStatus(order.status)});
      } catch (error) {
        if (error?.code !== 'PAYMENT_VERIFICATION_MISMATCH') throw error;
      }

      await repository.completeTransition(
        orderId, 'payment_verifying', workerId, verifying.claimId,
        {reconciliationDueAt:clock()}
      );
      if (isExactlyUnpaid(evidence, order)) {
        const pending = await repository.claimTransition(orderId, 'pending_payment', workerId);
        if (pending) {
          await repository.completeTransition(orderId, 'pending_payment', workerId, pending.claimId, {
            reconciliationDueAt:retryAt(order, clock()),
          });
        }
        return Object.freeze({status:'payment_verification_pending'});
      }
      const review = await repository.claimTransition(orderId, 'manual_review', workerId);
      if (review) {
        await repository.completeTransition(orderId, 'manual_review', workerId, review.claimId);
      }
      await alertOperator({code:'payment_verification_mismatch',orderId});
      return Object.freeze({status:'manual_review'});
    },

    async reconcilePendingOrders(now = clock()) {
      const at = new Date(now);
      if (Number.isNaN(at.getTime())) throw commerceError('ORDER_INVALID', 'Reconciliation time is invalid');
      const recovered = await repository.recoverExpiredEffects(at);
      for (const orderId of recovered.manualReviewOrderIds) {
        await alertOperator({code:'invoice_send_unknown',orderId});
      }
      for (const ignored of recovered.manualReviewPilotAuthBindings) {
        void ignored;
        await alertOperator({code:'pilot_auth_email_unknown'});
      }
      const flags = readFlags();
      const approved = requireApprovedEmail(getApprovedPilotEmail);
      const binding = recipientBinding(approved);
      if (flags.digitalInvoicePilotEnabled === true
        && recovered.recoveredPilotAuthBindings.includes(binding)) {
        await dispatchPilotAuthEmail(approved, binding);
      }
      for (const orderId of recovered.recoveredCreateOrderIds) {
        try { await resumeDigitalInvoice(orderId); } catch (error) {
          if (!['ORDER_PROCESSING_PENDING','ORDER_MANUAL_REVIEW'].includes(error?.code)) throw error;
        }
      }

      const candidates = await repository.listReconciliationCandidates(at, {limit:RECONCILIATION_LIMIT});
      if (candidates.length > 0 && quickbooks?.getAccountingChanges) {
        try {
          await quickbooks.getAccountingChanges({
            changedSince:new Date(at.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          });
        } catch {
          await alertOperator({code:'quickbooks_cdc_unavailable'});
        }
      }
      let verified = 0;
      for (const candidate of candidates) {
        if (!candidate.providerRefs?.invoiceId) {
          try { await resumeDigitalInvoice(candidate.id); } catch (error) {
            if (!['ORDER_PROCESSING_PENDING','ORDER_MANUAL_REVIEW'].includes(error?.code)) throw error;
          }
          continue;
        }
        await this.verifyOrderPayment({orderId:candidate.id,source:'scheduled'});
        verified += 1;
      }
      return Object.freeze({
        recoveredCreateCount:recovered.recoveredCreateOrderIds.length,
        manualReviewCount:recovered.manualReviewOrderIds.length
          + recovered.manualReviewPilotAuthBindings.length,
        reconciliationCandidateCount:candidates.length,
        verifiedCount:verified,
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

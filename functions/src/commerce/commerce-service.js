import {createHash, timingSafeEqual, randomUUID} from 'node:crypto';
import {getCommerceItem as getCatalogItem, listCommerceCapabilities as getCatalogCapabilities} from './catalog.js';
import {isReconciliationTerminalStatus, newOrder} from './order-state.js';
import {verifyQuickBooksPaymentEvidence} from './quickbooks-payment-verifier.js';
import {readCommerceFeatureFlags} from './feature-flags.js';

const GENERIC_AUTH_RESULT = Object.freeze({status:'request_received'});
const SAFE_ORDER_RESULT_MESSAGE = 'QuickBooks sent payment instructions to your email.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RECONCILIATION_LIMIT = 50;
const RECONCILIATION_HINT_TTL_MS = 24 * 60 * 60 * 1000;
const REFUND_REASON_MAXIMUM = 500;

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

function requireAdminContext(authContext) {
  if (!authContext?.app) throw commerceError('APP_CHECK_REQUIRED', 'App Check is required');
  if (typeof authContext?.uid !== 'string' || authContext.uid.length < 1) {
    throw commerceError('AUTH_REQUIRED', 'Authentication is required');
  }
  if ((authContext.admin ?? authContext.token?.admin) !== true) {
    throw commerceError('ADMIN_REQUIRED', 'An administrator is required');
  }
  return authContext.uid;
}

function refundRequest(input, {reasonRequired = false} = {}) {
  if (!record(input)) throw commerceError('ORDER_INVALID', 'Refund request is invalid');
  const allowed = reasonRequired ? ['amountCents','orderId','reason'] : ['amountCents','orderId'];
  if (Object.keys(input).some(key => !allowed.includes(key))
    || typeof input.orderId !== 'string' || !SAFE_IDEMPOTENCY_KEY.test(input.orderId)
    || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw commerceError('REFUND_AMOUNT_INVALID', 'Refund request is invalid');
  }
  if (reasonRequired && (typeof input.reason !== 'string'
    || input.reason !== input.reason.trim()
    || input.reason.length < 1 || input.reason.length > REFUND_REASON_MAXIMUM)) {
    throw commerceError('REFUND_REASON_INVALID', 'Refund reason is invalid');
  }
  return input;
}

function refundReviewIdempotencyKey({orderId,amountCents,reason}, adminUid) {
  return createHash('sha256')
    .update(`refund-review\0${orderId}\0${amountCents}\0${reason}\0${adminUid}`)
    .digest('hex');
}

function exactRefundEvidence(evidence, paymentEvidence, order, amountCents) {
  const refund = evidence?.refund;
  const payment = paymentEvidence?.payments?.[0];
  return record(evidence)
    && Object.keys(evidence).sort().join(',') === [
      'currency','invoiceId','providerOrderRef','providerPaymentRef','realmId','refund',
    ].sort().join(',')
    && record(refund)
    && Object.keys(refund).sort().join(',') === [
      'amountCents','currency','entityState','invoiceId','providerOrderRef','providerPaymentRef','refundId','status',
    ].sort().join(',')
    && evidence.realmId === order.providerRefs.realmId
    && evidence.invoiceId === order.providerRefs.invoiceId
    && evidence.providerOrderRef === order.providerRefs.providerOrderRef
    && evidence.providerPaymentRef === payment?.providerPaymentRef
    && evidence.currency === order.currency
    && typeof refund.refundId === 'string' && refund.refundId.length > 0
    && refund.entityState === 'present'
    && refund.status === 'completed'
    && refund.amountCents === amountCents
    && refund.invoiceId === evidence.invoiceId
    && refund.providerOrderRef === evidence.providerOrderRef
    && refund.providerPaymentRef === evidence.providerPaymentRef
    && refund.currency === evidence.currency;
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

function customerSafeOrderStatus(status) {
  if (['created','invoice_processing'].includes(status)) return 'invoice_send_pending';
  if (['pending_payment','payment_verifying','invoiced'].includes(status)) return 'payment_verification_pending';
  if (['paid','fulfilling'].includes(status)) return 'paid';
  if (status === 'fulfilled') return 'fulfilled';
  if (['cancelled','refunded'].includes(status)) return 'cancelled';
  return 'manual_support';
}

function customerStatus(order) {
  const status = order.status === 'paid' && order.lastErrorCode
    ? 'fulfillment_delayed'
    : customerSafeOrderStatus(order.status);
  const messages = {
    invoice_send_pending:'Your QuickBooks invoice email is being prepared. No payment is verified yet.',
    payment_verification_pending:'QuickBooks sent payment instructions to your email. Payment verification is pending.',
    paid:'We have verified your payment. Protected delivery is being prepared.',
    fulfillment_delayed:'We have verified your payment; delivery is delayed.',
    fulfilled:'Payment and protected delivery are verified.',
    cancelled:'This order is cancelled. No delivery is available.',
    manual_support:'This order needs manual support before it can continue.',
  };
  return Object.freeze({status,message:messages[status],downloadReady:status === 'fulfilled'});
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
  listCommerceCapabilities = getCatalogCapabilities,
  isDigitalFulfillmentAvailable = () => false,
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
    url:'https://ballkingdom.com/order-status.html?sku=home-inspection-study-guide',
    handleCodeInApp:true,
  }),
} = {}) {
  if (!repository || typeof readFlags !== 'function' || typeof getApprovedPilotEmail !== 'function'
    || typeof getCommerceItem !== 'function' || typeof listCommerceCapabilities !== 'function'
    || typeof isDigitalFulfillmentAvailable !== 'function' || typeof idFactory !== 'function'
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

  async function verifyOrderPaymentInternal({orderId, source} = {}) {
    if (!['scheduled','webhook_hint','admin'].includes(source)) {
      throw commerceError('ORDER_INVALID', 'Payment verification source is invalid');
    }
    let order = await repository.getOrder(orderId);
    if (!order) throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
    if (isReconciliationTerminalStatus(order.status)) {
      return Object.freeze({
        status:safeOrderStatus(order.status),
        disposition:'terminal_observed',
      });
    }
    if (!['pending_payment','payment_verifying','invoiced','paid','fulfilling'].includes(order.status)
      || !order.providerRefs?.invoiceId) {
      return Object.freeze({status:safeOrderStatus(order.status),disposition:'deferred'});
    }
    const workerId = workerIdFactory('payment-verification');
    const verifying = await repository.claimPaymentVerification(orderId, workerId, clock());
    if (!verifying) {
      order = await repository.getOrder(orderId);
      if (!order) throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      const terminal = isReconciliationTerminalStatus(order.status);
      return Object.freeze({
        status:safeOrderStatus(order.status),
        disposition:terminal ? 'terminal_observed' : 'deferred',
      });
    }
    let evidence;
    try {
      evidence = await quickbooks.getInvoice(order.providerRefs.invoiceId);
    } catch {
      await repository.completePaymentVerification(orderId, workerId, verifying.claimId, {
        outcome:'retry',errorCode:'payment_evidence_unavailable',retryAt:retryAt(order, clock()),
      });
      return Object.freeze({status:'payment_verification_pending',disposition:'deferred'});
    }

    try {
      const verified = verifyQuickBooksPaymentEvidence(evidence, {
        realmId:order.providerRefs.realmId,
        invoiceId:order.providerRefs.invoiceId,
        providerOrderRef:order.providerRefs.providerOrderRef,
        amountCents:order.amountCents,
        currency:order.currency,
      });
      const completeVerified = order.orderType === 'service'
        ? repository.completeVerifiedServiceOrder.bind(repository)
        : repository.completeVerifiedDigitalOrder.bind(repository);
      await completeVerified(orderId, workerId, verifying.claimId, {
        realmId:verified.realmId,
        providerOrderRef:verified.providerOrderRef,
        providerPaymentRef:verified.providerPaymentRef,
      });
      return Object.freeze({status:order.orderType === 'service' ? 'paid' : 'fulfilled',disposition:'completed'});
    } catch (error) {
      if (error?.code !== 'PAYMENT_VERIFICATION_MISMATCH') throw error;
    }

    if (isExactlyUnpaid(evidence, order) && ['pending_payment','payment_verifying','invoiced'].includes(order.status)) {
      await repository.completePaymentVerification(orderId, workerId, verifying.claimId, {
        outcome:'pending',retryAt:retryAt(order, clock()),
      });
      return Object.freeze({status:'payment_verification_pending',disposition:'completed'});
    }
    await repository.completePaymentVerification(orderId, workerId, verifying.claimId, {
      outcome:'manual_review',errorCode:'payment_verification_mismatch',
    });
    return Object.freeze({status:'manual_review',disposition:'completed'});
  }

  async function approveServiceInvoiceInternal({appointmentId} = {}) {
    const flags = readFlags();
    if (flags.serviceQboSendEnabled !== true) {
      throw commerceError('COMMERCE_DISABLED','Service invoicing is unavailable');
    }
    if (!quickbooks?.createCommerceInvoice || !quickbooks?.getInvoice || !quickbooks?.sendInvoice) {
      throw commerceError('COMMERCE_CONFIGURATION_INVALID','Commerce is unavailable');
    }
    await repository.beginServiceInvoiceApproval(appointmentId);
    let order = await repository.getOrder(appointmentId);
    if (!order || order.orderType !== 'service') throw commerceError('ORDER_NOT_FOUND','Order was not found');
    if (order.status === 'manual_review') throw commerceError('ORDER_MANUAL_REVIEW','Order requires administrator review');
    if (order.status === 'invoiced') {
      return Object.freeze({...order.serviceInvoiceReceipt,duplicate:true});
    }

    const createWorker = workerIdFactory('service-invoice-create');
    const createClaim = await repository.claimEffect(appointmentId,'invoice_create',createWorker,clock());
    if (createClaim) {
      try {
        let created;
        let readback;
        if (order.providerRefs?.invoiceId) {
          readback = await quickbooks.getInvoice(order.providerRefs.invoiceId);
          created = {invoiceId:order.providerRefs.invoiceId,customerId:order.providerRefs.customerId};
        } else {
          created = await quickbooks.createCommerceInvoice(order);
          readback = await quickbooks.getInvoice(created.invoiceId);
        }
        if (readback?.invoice?.invoiceId !== created.invoiceId
          || readback.invoice.providerOrderRef !== `bk-order-${appointmentId}`
          || readback.invoice.totalAmountCents !== order.amountCents
          || readback.invoice.currency !== order.currency
          || readback.invoice.entityState !== 'present'
          || typeof created.customerId !== 'string' || created.customerId.length < 1) {
          throw commerceError('INVOICE_READBACK_INVALID','Invoice readback was invalid');
        }
        const providerRefs={
          realmId:readback.realmId,invoiceId:created.invoiceId,customerId:created.customerId,
          providerOrderRef:readback.invoice.providerOrderRef,
        };
        if (typeof created.documentNumber === 'string' && created.documentNumber.length > 0) {
          providerRefs.documentNumber=created.documentNumber;
        }
        await repository.completeEffect(appointmentId,'invoice_create',createWorker,createClaim.claimId,{providerRefs});
      } catch (error) {
        if (error?.code !== 'PROVIDER_TIMEOUT') await repository.recordEffectFailure(
          appointmentId,'invoice_create',createWorker,createClaim.claimId,{code:'invoice_create_failed'},clock()
        );
        throw commerceError('ORDER_PROCESSING_PENDING','Order processing is pending');
      }
    } else {
      const effect = await waitForEffect(appointmentId,'invoice_create');
      if (effect?.status !== 'completed') throw commerceError('ORDER_PROCESSING_PENDING','Order processing is pending');
    }

    order = await repository.getOrder(appointmentId);
    const sendWorker = workerIdFactory('service-invoice-send');
    const sendClaim = await repository.claimEffect(appointmentId,'invoice_send',sendWorker,clock());
    if (sendClaim) {
      await repository.markEffectDispatchStarted(appointmentId,'invoice_send',sendWorker,sendClaim.claimId,clock());
      try {
        const sent = await quickbooks.sendInvoice({invoiceId:order.providerRefs.invoiceId,customerEmail:order.customer.email});
        if (sent?.sendAccepted !== true || sent.invoiceId !== order.providerRefs.invoiceId) throw new Error('invalid send');
      } catch {
        await repository.recordEffectFailure(appointmentId,'invoice_send',sendWorker,sendClaim.claimId,{code:'invoice_send_unknown'},clock());
        throw commerceError('ORDER_MANUAL_REVIEW','Order requires administrator review');
      }
      await repository.completeEffect(appointmentId,'invoice_send',sendWorker,sendClaim.claimId);
    } else {
      const effect = await waitForEffect(appointmentId,'invoice_send');
      if (effect?.status === 'manual_review') throw commerceError('ORDER_MANUAL_REVIEW','Order requires administrator review');
      if (effect?.status !== 'completed') throw commerceError('ORDER_PROCESSING_PENDING','Order processing is pending');
    }
    const documentNumber = order.providerRefs.documentNumber ?? null;
    await repository.completeServiceInvoiceApproval(appointmentId,{invoiceId:order.providerRefs.invoiceId,documentNumber,sendAccepted:true});
    return Object.freeze({invoiceId:order.providerRefs.invoiceId,documentNumber,sendAccepted:true});
  }

  return Object.freeze({
    async createServiceOrder(appointmentId, appointment) {
      const flags = readFlags();
      if (flags.serviceQboSendEnabled !== true) return {disabled:true};
      if (!appointment || !Number.isInteger(appointment.amountCents) || appointment.amountCents <= 0) {
        throw commerceError('ORDER_INVALID','Service order is invalid');
      }
      const order = newOrder({item:{
        sku:`service-${appointment.serviceType}`,name:appointment.serviceName,
        amountCents:appointment.amountCents,currency:appointment.currency,orderType:'service',
        fulfillmentType:'scheduled_service',
      },customer:{name:appointment.customerName,email:appointment.customerEmail}});
      return repository.createServiceOrder(appointmentId,order);
    },

    approveServiceInvoice: approveServiceInvoiceInternal,
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
      return Object.freeze({orderHandle,...customerStatus(order)});
    },

    async getBuyerCommerceCapability(appCheckContext) {
      if (!appCheckContext?.app) throw commerceError('APP_CHECK_REQUIRED', 'App Check is required');
      const flags = readFlags();
      const releaseReady = flags.digitalInvoicePilotEnabled === true
        && isDigitalFulfillmentAvailable() === true;
      const products = listCommerceCapabilities().map(item => Object.freeze({
        sku:item.sku,
        active:releaseReady && item.active === true,
      }));
      return Object.freeze({products:Object.freeze(products)});
    },

    async verifyOrderPayment(input = {}) {
      const result = await verifyOrderPaymentInternal(input);
      return Object.freeze({status:result.status});
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
      const resolveEntity = async ({realmId,entityName,entityId}, capacity) => {
        if (entityName === 'Invoice') {
          return Object.freeze({orders:await resolveInvoice(realmId, entityId),complete:true});
        }
        const resolved = new Map();
        let newOrderCount = 0;
        if (entityName === 'Payment' && quickbooks?.getPayment) {
          const payment = await quickbooks.getPayment(entityId);
          const applications = payment.applications.slice(0, 10);
          for (let index = 0; index < applications.length; index += 1) {
            if (newOrderCount >= capacity) {
              return Object.freeze({orders:[...resolved.values()],complete:false});
            }
            const application = applications[index];
            if (application.linkedTxnType === 'Invoice') {
              for (const order of await resolveInvoice(realmId, application.linkedTxnId)) {
                if (!resolved.has(order.id)) {
                  resolved.set(order.id, order);
                  if (!prioritized.has(order.id)) newOrderCount += 1;
                }
              }
            }
          }
        }
        return Object.freeze({orders:[...resolved.values()],complete:true});
      };
      const addResolved = (orders, source) => {
        const newOrders = orders.filter(order => !prioritized.has(order.id));
        if (newOrders.length > RECONCILIATION_LIMIT - prioritized.size) return false;
        for (const order of newOrders) prioritized.set(order.id, {order,source});
        return true;
      };
      for (const hint of hints) {
        const capacity = RECONCILIATION_LIMIT - prioritized.size;
        if (capacity <= 0) break;
        try {
          const resolved = await resolveEntity(hint, capacity);
          if (addResolved(resolved.orders, 'webhook_hint') && resolved.complete) {
            mappedHints.set(hint.hintId, new Set(resolved.orders.map(order => order.id)));
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
            const capacity = RECONCILIATION_LIMIT - prioritized.size;
            if (capacity <= 0) break;
            const resolved = await resolveEntity({
              realmId:changes.realmId,
              entityName:change.entityType,
              entityId:change.entityId,
            }, capacity);
            if (!addResolved(resolved.orders, 'scheduled')) break;
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
        const result = await verifyOrderPaymentInternal({orderId:candidate.id,source});
        if (result.disposition === 'completed' || result.disposition === 'terminal_observed') {
          processedOrderIds.add(candidate.id);
          verified += 1;
        }
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

    async requestRefundReview(input, authContext) {
      const adminUid = requireAdminContext(authContext);
      const request = refundRequest(input, {reasonRequired:true});
      const order = await repository.getOrder(request.orderId);
      if (!order || !['paid','fulfilled'].includes(order.status)
        || !order.providerRefs?.invoiceId || !order.providerRefs?.realmId) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      }
      let evidence;
      try {
        evidence = await quickbooks?.getInvoice?.(order.providerRefs.invoiceId);
        verifyQuickBooksPaymentEvidence(evidence, {
          realmId:order.providerRefs.realmId,
          invoiceId:order.providerRefs.invoiceId,
          providerOrderRef:order.providerRefs.providerOrderRef,
          amountCents:order.amountCents,
          currency:order.currency,
        });
      } catch {
        throw commerceError('REFUND_EVIDENCE_UNAVAILABLE', 'Refund amount cannot be verified');
      }
      const verifiedUnrefundedAmountCents = order.amountCents - Number(order.refundedAmountCents ?? 0);
      if (request.amountCents > verifiedUnrefundedAmountCents) {
        throw commerceError('REFUND_AMOUNT_INVALID', 'Refund amount is invalid');
      }
      if (typeof repository.recordRefundReview !== 'function') {
        throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
      }
      const recorded = await repository.recordRefundReview({
        orderId:request.orderId,
        amountCents:request.amountCents,
        reason:request.reason,
        adminUid,
        verifiedUnrefundedAmountCents,
        idempotencyKey:refundReviewIdempotencyKey(request, adminUid),
      });
      return Object.freeze({
        reviewHandle:createHash('sha256').update(`refund-review-handle\0${recorded.reviewId}`).digest('hex'),
        status:'pending_operator_action',
        duplicate:recorded.duplicate === true,
      });
    },

    async reconcileOrder(input, authContext) {
      requireAdminContext(authContext);
      if (!record(input) || Object.keys(input).some(key => key !== 'orderId')
        || typeof input.orderId !== 'string' || !SAFE_IDEMPOTENCY_KEY.test(input.orderId)) {
        throw commerceError('ORDER_INVALID', 'Order is invalid');
      }
      const order = await repository.getOrder(input.orderId);
      if (!order || !['paid','fulfilled'].includes(order.status)
        || !order.providerRefs?.invoiceId || !order.providerRefs?.realmId) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      }
      try {
        const evidence = await quickbooks?.getInvoice?.(order.providerRefs.invoiceId);
        verifyQuickBooksPaymentEvidence(evidence, {
          realmId:order.providerRefs.realmId,
          invoiceId:order.providerRefs.invoiceId,
          providerOrderRef:order.providerRefs.providerOrderRef,
          amountCents:order.amountCents,
          currency:order.currency,
        });
      } catch {
        throw commerceError('PAYMENT_EVIDENCE_UNAVAILABLE', 'Accounting evidence is unavailable');
      }
      return Object.freeze({orderHandle:order.id,status:order.status,evidence:'exact_accounting_payment'});
    },

    async reconcileRefund(input, authContext) {
      const adminUid = requireAdminContext(authContext);
      const request = refundRequest(input);
      const order = await repository.getOrder(request.orderId);
      if (!order || !['paid','fulfilled'].includes(order.status)
        || !order.providerRefs?.invoiceId || !order.providerRefs?.realmId) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      }
      const preserveForManualReview = async errorCode => {
        if (typeof repository.recordRefundManualReview === 'function') {
          await repository.recordRefundManualReview({orderId:order.id,adminUid,errorCode});
        }
        return Object.freeze({orderHandle:order.id,status:order.status,reconciliation:'manual_review'});
      };
      let paymentEvidence;
      let refundEvidence;
      try {
        paymentEvidence = await quickbooks?.getInvoice?.(order.providerRefs.invoiceId);
        verifyQuickBooksPaymentEvidence(paymentEvidence, {
          realmId:order.providerRefs.realmId,
          invoiceId:order.providerRefs.invoiceId,
          providerOrderRef:order.providerRefs.providerOrderRef,
          amountCents:order.amountCents,
          currency:order.currency,
        });
        if (typeof quickbooks?.getRefundEvidence !== 'function') {
          return preserveForManualReview('refund_evidence_unsupported');
        }
        refundEvidence = await quickbooks.getRefundEvidence(order.providerRefs.invoiceId);
      } catch {
        return preserveForManualReview('refund_evidence_unavailable');
      }
      if (!exactRefundEvidence(refundEvidence, paymentEvidence, order, request.amountCents)) {
        return preserveForManualReview('refund_evidence_mismatch');
      }
      if (typeof repository.completeRefundReconciliation !== 'function') {
        return preserveForManualReview('refund_reconciliation_unavailable');
      }
      await repository.completeRefundReconciliation({
        orderId:order.id,amountCents:request.amountCents,adminUid,
        evidenceId:createHash('sha256').update(
          `refund-evidence\0${refundEvidence.refund.refundId}\0${refundEvidence.providerPaymentRef}`
        ).digest('hex'),
      });
      return Object.freeze({orderHandle:order.id,status:'refunded',reconciliation:'exact_accounting_refund'});
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

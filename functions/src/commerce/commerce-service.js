import {createHash, timingSafeEqual, randomUUID} from 'node:crypto';
import {
  getCommerceItem as getCatalogItem,
  getConfiguredPaymentsCapability as getCatalogPaymentsCapability,
  listCommerceCapabilities as getCatalogCapabilities,
} from './catalog.js';
import {isReconciliationTerminalStatus, newOrder} from './order-state.js';
import {verifyQuickBooksPaymentEvidence} from './quickbooks-payment-verifier.js';
import {readCommerceFeatureFlags} from './feature-flags.js';
import {assertPaymentsCapability} from '../providers/quickbooks-payments-capability.js';

const GENERIC_AUTH_RESULT = Object.freeze({status:'request_received'});
const SAFE_ORDER_RESULT_MESSAGE = 'QuickBooks sent payment instructions to your email.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PILOT_SKU = 'home-inspection-study-guide';
const DEFAULT_ACTION_CODE_SETTINGS = Object.freeze({
  url:`https://ballkingdom.com/order-status.html?sku=${PILOT_SKU}`,
  handleCodeInApp:true,
});
const RECONCILIATION_LIMIT = 50;
const RECONCILIATION_HINT_TTL_MS = 24 * 60 * 60 * 1000;
const REFUND_REASON_MAXIMUM = 500;
const PUBLIC_AUTH_WINDOW_MS = 10 * 60 * 1000;
const SHA256_DIGEST = /^[a-f0-9]{64}$/;
const PUBLIC_APP_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const PUBLIC_PAYMENT_METHODS = new Set(['card','apple_pay','paypal','venmo']);

function commerceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buyerDisplay(value) {
  const display = value?.display;
  const keys = ['name','amountCents','currency','invoiceProvider','paymentMethods','delivery'];
  if (!record(display) || Object.keys(display).length !== keys.length || keys.some(key => !Object.hasOwn(display,key))
    || typeof display.name !== 'string' || display.name.trim().length < 1 || display.name.length > 160
    || !Number.isSafeInteger(display.amountCents) || display.amountCents < 1 || display.amountCents > 100000000
    || display.currency !== 'USD' || display.invoiceProvider !== 'quickbooks' || display.delivery !== 'protected_electronic_delivery'
    || !Array.isArray(display.paymentMethods) || display.paymentMethods.length < 1 || display.paymentMethods.length > 4
    || new Set(display.paymentMethods).size !== display.paymentMethods.length
    || display.paymentMethods.some(method => !PUBLIC_PAYMENT_METHODS.has(method))) return null;
  return Object.freeze({...display,paymentMethods:Object.freeze([...display.paymentMethods])});
}

export function buildPilotActionCodeSettings(orderHandle = null, base = DEFAULT_ACTION_CODE_SETTINGS) {
  if (!record(base) || Object.keys(base).length !== 2 || base.handleCodeInApp !== true
    || typeof base.url !== 'string') throw commerceError('COMMERCE_CONFIGURATION_INVALID','Commerce is unavailable');
  let url;
  try { url = new URL(base.url); } catch { throw commerceError('COMMERCE_CONFIGURATION_INVALID','Commerce is unavailable'); }
  if (url.origin !== 'https://ballkingdom.com' || url.pathname !== '/order-status.html') {
    throw commerceError('COMMERCE_CONFIGURATION_INVALID','Commerce is unavailable');
  }
  if (orderHandle !== null && (typeof orderHandle !== 'string' || !SAFE_IDEMPOTENCY_KEY.test(orderHandle))) {
    throw commerceError('ORDER_NOT_FOUND','Order was not found');
  }
  url.search='';
  url.searchParams.set('sku',PILOT_SKU);
  if (orderHandle !== null) url.searchParams.set('order',orderHandle);
  return Object.freeze({url:url.toString(),handleCodeInApp:true});
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

function publicAuthEmailDigest(email) {
  return createHash('sha256').update(`public-auth-email\0${email}`).digest('hex');
}

function publicAuthContext(context) {
  const appId = context?.app?.appId;
  const ipDigest = context?.ipDigest;
  if (typeof appId !== 'string' || !PUBLIC_APP_ID.test(appId)
    || typeof ipDigest !== 'string' || !SHA256_DIGEST.test(ipDigest)) return null;
  return Object.freeze({appId,ipDigest});
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

function refundReviewIdempotencyKey({orderId,amountCents}) {
  return createHash('sha256')
    .update(`refund-review\0${orderId}\0${amountCents}`)
    .digest('hex');
}

function refundOrderBinding(order) {
  return createHash('sha256').update(
    `refund-order-binding\0${order.providerRefs.realmId}\0${order.providerRefs.invoiceId}\0${order.providerRefs.providerOrderRef}`
  ).digest('hex');
}

function normalizeRefundEvidence(evidence, paymentEvidence, order) {
  const payment = paymentEvidence?.payments?.[0];
  if (!record(evidence)
    || Object.keys(evidence).sort().join(',') !== [
      'capability','currency','invoiceId','providerOrderRef','providerPaymentRef','realmId','refunds',
    ].sort().join(',')
    || evidence.capability !== 'documented_accounting_refund_v1'
    || evidence.realmId !== order.providerRefs.realmId
    || evidence.invoiceId !== order.providerRefs.invoiceId
    || evidence.providerOrderRef !== order.providerRefs.providerOrderRef
    || evidence.providerPaymentRef !== payment?.providerPaymentRef
    || evidence.currency !== order.currency
    || !Array.isArray(evidence.refunds) || evidence.refunds.length > 100) return null;
  const ids = new Set();
  let cumulativeRefundedAmountCents = 0;
  for (const refund of evidence.refunds) {
    if (!record(refund)
      || Object.keys(refund).sort().join(',') !== [
        'amountCents','currency','entityState','invoiceId','providerOrderRef','providerPaymentRef','refundId','status',
      ].sort().join(',')
      || typeof refund.refundId !== 'string' || refund.refundId.length < 1 || ids.has(refund.refundId)
      || refund.entityState !== 'present' || refund.status !== 'completed'
      || !Number.isSafeInteger(refund.amountCents) || refund.amountCents <= 0
      || refund.invoiceId !== evidence.invoiceId
      || refund.providerOrderRef !== evidence.providerOrderRef
      || refund.providerPaymentRef !== evidence.providerPaymentRef
      || refund.currency !== evidence.currency) return null;
    ids.add(refund.refundId);
    cumulativeRefundedAmountCents += refund.amountCents;
    if (!Number.isSafeInteger(cumulativeRefundedAmountCents)
      || cumulativeRefundedAmountCents > order.amountCents) return null;
  }
  return Object.freeze({
    cumulativeRefundedAmountCents,
    evidenceId:createHash('sha256').update(
      `refund-evidence\0${[...ids].sort().join('\0')}\0${evidence.providerPaymentRef}`
    ).digest('hex'),
  });
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
  const exactBase = evidence?.realmId === order.providerRefs.realmId
    && invoice?.invoiceId === order.providerRefs.invoiceId
    && invoice?.providerOrderRef === order.providerRefs.providerOrderRef
    && invoice?.totalAmountCents === order.amountCents
    && invoice?.balanceCents === order.amountCents
    && invoice?.currency === order.currency
    && invoice?.entityState === 'present'
    && invoice?.paymentState === 'unpaid'
    && Array.isArray(evidence?.payments)
    && evidence.payments.length === 0;
  if (!exactBase) return false;
  if (order.orderType === 'service') return true;
  return order.orderType === 'digital_product'
    && invoice?.customerId === order.providerRefs.customerId
    && invoice?.itemId === order.accountingSnapshot?.itemId
    && invoice?.taxCode === order.accountingSnapshot?.taxCode
    && invoice?.quantity === 1
    && invoice?.lineAmountCents === order.amountCents
    && invoice?.unitPriceCents === order.amountCents;
}

function isExactBoundInvoice(evidence, order) {
  const invoice = evidence?.invoice;
  return evidence?.realmId === order.providerRefs.realmId
    && invoice?.invoiceId === order.providerRefs.invoiceId
    && invoice?.providerOrderRef === `bk-order-${order.id}`
    && invoice?.providerOrderRef === order.providerRefs.providerOrderRef
    && invoice?.customerId === order.providerRefs.customerId
    && invoice?.itemId === order.accountingSnapshot?.itemId
    && invoice?.taxCode === order.accountingSnapshot?.taxCode
    && invoice?.quantity === 1
    && invoice?.lineAmountCents === order.amountCents
    && invoice?.unitPriceCents === order.amountCents
    && invoice?.totalAmountCents === order.amountCents
    && invoice?.currency === order.currency
    && invoice?.entityState === 'present';
}

function paymentExpectation(order) {
  const expected = {
    realmId:order.providerRefs.realmId,
    invoiceId:order.providerRefs.invoiceId,
    providerOrderRef:order.providerRefs.providerOrderRef,
    amountCents:order.amountCents,
    currency:order.currency,
  };
  if (order.orderType === 'digital_product') {
    Object.assign(expected, {
      customerId:order.providerRefs.customerId,
      itemId:order.accountingSnapshot?.itemId,
      taxCode:order.accountingSnapshot?.taxCode,
    });
  }
  return expected;
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
  getPaymentsCapability = getCatalogPaymentsCapability,
  listCommerceCapabilities = getCatalogCapabilities,
  isDigitalFulfillmentAvailable = () => false,
  readFeatureFlags: readFlags = readCommerceFeatureFlags,
  getApprovedPilotEmail,
  getCurrentUser,
  fulfillDigitalOrder = async () => ({fulfilled:true}),
  alertOperator = async () => {},
  authRequestLimiter = async () => true,
  publicAuthLimiter = null,
  statusRequestLimiter = async () => true,
  idFactory = randomUUID,
  workerIdFactory = purpose => `${purpose}-${randomUUID()}`,
  clock = () => new Date(),
  sleep = () => new Promise(resolve => setTimeout(resolve, 25)),
  actionCodeSettings = DEFAULT_ACTION_CODE_SETTINGS,
} = {}) {
  if (!repository || typeof readFlags !== 'function' || typeof getApprovedPilotEmail !== 'function'
    || typeof getCommerceItem !== 'function' || typeof getPaymentsCapability !== 'function'
    || typeof listCommerceCapabilities !== 'function'
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

  function verifiedPaymentsCapability() {
    try {
      return assertPaymentsCapability(getPaymentsCapability());
    } catch {
      return null;
    }
  }

  async function dispatchPilotAuthEmail(approvedEmail, binding, settings = actionCodeSettings) {
    if (!auth?.generateSignInWithEmailLink || !graph?.sendPilotAuthLink) {
      throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
    }
    const workerId = workerIdFactory('pilot-auth-email');
    const claim = await repository.claimPilotAuthEmailEffect(binding, workerId, clock());
    if (!claim) return false;

    let link;
    try {
      link = await auth.generateSignInWithEmailLink(approvedEmail, settings);
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

  async function dispatchPublicDigitalAuthEmail(email, binding, settings = actionCodeSettings) {
    if (!auth?.generateSignInWithEmailLink || !graph?.sendPilotAuthLink) {
      throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
    }
    const workerId = workerIdFactory('public-digital-auth-email');
    const claim = await repository.claimPublicDigitalAuthEmailEffect(binding, workerId, clock());
    if (!claim) return false;
    let link;
    try {
      link = await auth.generateSignInWithEmailLink(email, settings);
    } catch {
      await repository.recordPublicDigitalAuthEmailFailure(
        binding, workerId, claim.claimId, {code:'public_digital_auth_link_generation_failed'}
      );
      return false;
    }
    await repository.markPublicDigitalAuthDispatchStarted(binding, workerId, claim.claimId, clock());
    try {
      await graph.sendPilotAuthLink({to:email,link});
    } catch {
      await repository.recordPublicDigitalAuthEmailFailure(
        binding, workerId, claim.claimId, {code:'public_digital_auth_email_unknown'}
      );
      return false;
    }
    await repository.completePublicDigitalAuthEmailEffect(binding, workerId, claim.claimId);
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
            || readback.invoice.customerId !== created.customerId
            || readback.invoice.itemId !== order.accountingSnapshot?.itemId
            || readback.invoice.taxCode !== order.accountingSnapshot?.taxCode
            || readback.invoice.quantity !== 1
            || readback.invoice.lineAmountCents !== order.amountCents
            || readback.invoice.unitPriceCents !== order.amountCents
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
        const customerAmbiguous = error?.code === 'QBO_CUSTOMER_AMBIGUOUS';
        if (error?.code !== 'PROVIDER_TIMEOUT') {
          await repository.recordEffectFailure(
            orderId, 'invoice_create', createWorker, createClaim.claimId,
            customerAmbiguous
              ? {code:'customer_accounting_ambiguous',terminal:true}
              : {code:'invoice_create_failed'},
            clock()
          );
        }
        if (customerAmbiguous) {
          throw commerceError('ORDER_MANUAL_REVIEW', 'Order requires administrator review');
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
    if (typeof repository.cleanupExpiredPublicAuthArtifacts === 'function') {
      await repository.cleanupExpiredPublicAuthArtifacts(at, {limit:500});
    }
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
      const verified = verifyQuickBooksPaymentEvidence(evidence, paymentExpectation(order));
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
    async requestPublicSignInLink(input, context) {
      if (!record(input) || Object.keys(input).some(key => !['email','orderHandle'].includes(key))
        || !Object.hasOwn(input,'email')) return GENERIC_AUTH_RESULT;
      const candidate = normalizedEmail(input.email);
      const metadata = publicAuthContext(context);
      if (!candidate || !metadata || !publicAuthLimiter?.consume) return GENERIC_AUTH_RESULT;
      const hasOrderHandle = Object.hasOwn(input, 'orderHandle');
      if (hasOrderHandle && (typeof input.orderHandle !== 'string'
        || !SAFE_IDEMPOTENCY_KEY.test(input.orderHandle))) return GENERIC_AUTH_RESULT;
      let allowed;
      try {
        allowed = await publicAuthLimiter.consume({
          emailDigest:publicAuthEmailDigest(candidate),ipDigest:metadata.ipDigest,appId:metadata.appId,
        });
      } catch {
        return GENERIC_AUTH_RESULT;
      }
      if (allowed !== true || readFlags().publicDigitalCheckoutEnabled !== true) return GENERIC_AUTH_RESULT;
      let settings = buildPilotActionCodeSettings(null, actionCodeSettings);
      if (hasOrderHandle) {
        const order = await repository.getOrder(input.orderHandle);
        if (!order || order.authorizedRecipientBinding !== recipientBinding(candidate)
          || order.sku !== PILOT_SKU || order.orderType !== 'digital_product'
          || typeof order.customerUid !== 'string' || order.customerUid.length < 1) {
          return GENERIC_AUTH_RESULT;
        }
        settings = buildPilotActionCodeSettings(input.orderHandle, actionCodeSettings);
      }
      const effect = await repository.createPublicDigitalAuthEmailEffect({
        email:candidate,sku:PILOT_SKU,purpose:'sign_in',
        issuanceBucket:Math.floor(clock().getTime() / PUBLIC_AUTH_WINDOW_MS),
      });
      if (!effect) return GENERIC_AUTH_RESULT;
      await dispatchPublicDigitalAuthEmail(candidate, effect.binding, settings);
      return GENERIC_AUTH_RESULT;
    },

    async requestPilotSignInLink(input, appCheckContext) {
      if (!appCheckContext?.app) throw commerceError('APP_CHECK_REQUIRED', 'App Check is required');
      if (!record(input) || Object.keys(input).some(key => !['email','orderHandle'].includes(key))
        || !Object.hasOwn(input,'email')) return GENERIC_AUTH_RESULT;
      const hasOrderHandle=Object.hasOwn(input,'orderHandle');
      if (hasOrderHandle && (typeof input.orderHandle !== 'string'
        || !SAFE_IDEMPOTENCY_KEY.test(input.orderHandle))) return GENERIC_AUTH_RESULT;
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
      let effectBinding=binding;
      let settings=buildPilotActionCodeSettings(null,actionCodeSettings);
      if (hasOrderHandle) {
        const order=await repository.getOrder(input.orderHandle);
        if (!order || order.authorizedRecipientBinding !== binding || order.sku !== PILOT_SKU
          || order.orderType !== 'digital_product' || typeof order.customerUid !== 'string'
          || order.customerUid.length < 1) return GENERIC_AUTH_RESULT;
        settings=buildPilotActionCodeSettings(input.orderHandle,actionCodeSettings);
        effectBinding=recipientBinding(`${binding}\0resume\0${input.orderHandle}`);
      }
      await repository.createPilotAuthEmailEffect(effectBinding);
      await dispatchPilotAuthEmail(approved, effectBinding, settings);
      return GENERIC_AUTH_RESULT;
    },

    async createDigitalOrder(input, authContext) {
      const flags = readFlags();
      if (flags.publicDigitalCheckoutEnabled !== true) {
        throw commerceError('COMMERCE_DISABLED', 'Digital ordering is unavailable');
      }
      if (!verifiedPaymentsCapability()) {
        throw commerceError('COMMERCE_CONFIGURATION_INVALID', 'Commerce is unavailable');
      }
      const identity = await authoritativeIdentity(authContext, getCurrentUser);
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
      const reservation = await repository.reservePublicDigitalOrder({
        customerBinding:identity.authorizedRecipientBinding,
        sku:item.sku,
        orderId:idFactory(),
        order,
      });
      await resumeDigitalInvoice(reservation.orderId, identity.email);
      const stored = await repository.getOrder(reservation.orderId);
      const storedStatus = reservation.duplicate ? customerStatus(stored) : null;
      return Object.freeze({
        orderHandle:reservation.orderId,
        amountCents:stored.amountCents,
        currency:stored.currency,
        status:storedStatus?.status ?? 'payment_verification_pending',
        message:storedStatus?.message ?? SAFE_ORDER_RESULT_MESSAGE,
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
      const releaseReady = flags.publicDigitalCheckoutEnabled === true
        && isDigitalFulfillmentAvailable() === true
        && verifiedPaymentsCapability() !== null;
      const products = listCommerceCapabilities().map(item => {
        const display = buyerDisplay(item);
        if (!display || typeof item?.sku !== 'string' || item.sku.length < 1 || item.sku.length > 128
          || typeof item.active !== 'boolean') throw commerceError('COMMERCE_CONFIGURATION_INVALID','Commerce is unavailable');
        return Object.freeze({sku:item.sku,active:releaseReady && item.active === true,display});
      });
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
          + recovered.manualReviewPilotAuthBindings.length
          + (recovered.manualReviewPublicAuthBindings?.length ?? 0),
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
          + recovered.manualReviewPilotAuthBindings.length
          + (recovered.manualReviewPublicAuthBindings?.length ?? 0),
      });
    },

    async requestRefundReview(input, authContext) {
      const adminUid = requireAdminContext(authContext);
      const request = refundRequest(input, {reasonRequired:true});
      if (quickbooks?.refundEvidenceCapability !== true
        || typeof quickbooks?.getRefundEvidence !== 'function') {
        throw commerceError('REFUND_EVIDENCE_UNAVAILABLE', 'Refund review is unavailable');
      }
      const order = await repository.getOrder(request.orderId);
      if (!order || !['paid','fulfilled'].includes(order.status)
        || !order.providerRefs?.invoiceId || !order.providerRefs?.realmId) {
        throw commerceError('ORDER_NOT_FOUND', 'Order was not found');
      }
      let paymentEvidence;
      let refundEvidence;
      try {
        paymentEvidence = await quickbooks?.getInvoice?.(order.providerRefs.invoiceId);
        verifyQuickBooksPaymentEvidence(paymentEvidence, paymentExpectation(order));
        refundEvidence = await quickbooks.getRefundEvidence(order.providerRefs.invoiceId);
      } catch {
        throw commerceError('REFUND_EVIDENCE_UNAVAILABLE', 'Refund amount cannot be verified');
      }
      const normalizedRefunds = normalizeRefundEvidence(refundEvidence,paymentEvidence,order);
      if (!normalizedRefunds) {
        throw commerceError('REFUND_EVIDENCE_UNAVAILABLE', 'Refund amount cannot be verified');
      }
      const authoritativeUnrefundedAmountCents = order.amountCents
        - normalizedRefunds.cumulativeRefundedAmountCents;
      if (request.amountCents > authoritativeUnrefundedAmountCents) {
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
        authoritativeTotalAmountCents:order.amountCents,
        authoritativeRefundedAmountCents:normalizedRefunds.cumulativeRefundedAmountCents,
        orderBinding:refundOrderBinding(order),
        idempotencyKey:refundReviewIdempotencyKey(request),
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
        verifyQuickBooksPaymentEvidence(evidence, paymentExpectation(order));
      } catch {
        throw commerceError('PAYMENT_EVIDENCE_UNAVAILABLE', 'Accounting evidence is unavailable');
      }
      return Object.freeze({orderHandle:order.id,status:order.status,evidence:'exact_accounting_payment'});
    },

    async reconcileRefund(input, authContext) {
      const adminUid = requireAdminContext(authContext);
      const request = refundRequest(input);
      const order = await repository.getOrder(request.orderId);
      if (!order || !['paid','fulfilled','refunded'].includes(order.status)
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
        verifyQuickBooksPaymentEvidence(paymentEvidence, paymentExpectation(order));
        if (quickbooks?.refundEvidenceCapability !== true
          || typeof quickbooks?.getRefundEvidence !== 'function') {
          return preserveForManualReview('refund_evidence_unsupported');
        }
        refundEvidence = await quickbooks.getRefundEvidence(order.providerRefs.invoiceId);
      } catch {
        return preserveForManualReview('refund_evidence_unavailable');
      }
      const normalizedRefunds = normalizeRefundEvidence(refundEvidence,paymentEvidence,order);
      const existingRefundedAmountCents = Number(order.refundedAmountCents ?? 0);
      if (order.status === 'refunded') {
        if (normalizedRefunds
          && normalizedRefunds.evidenceId === order.refundEvidenceId
          && normalizedRefunds.cumulativeRefundedAmountCents === existingRefundedAmountCents
          && order.lastReconciledRefundAmountCents === request.amountCents) {
          return Object.freeze({orderHandle:order.id,status:'refunded',reconciliation:'exact_accounting_refund'});
        }
        throw commerceError('REFUND_STATE_CONFLICT','Refund reconciliation conflicts with terminal state');
      }
      if (!normalizedRefunds
        || !Number.isSafeInteger(existingRefundedAmountCents)
        || normalizedRefunds.cumulativeRefundedAmountCents !== existingRefundedAmountCents + request.amountCents) {
        return preserveForManualReview('refund_evidence_mismatch');
      }
      if (typeof repository.completeRefundReconciliation !== 'function') {
        return preserveForManualReview('refund_reconciliation_unavailable');
      }
      let completed;
      try {
        completed = await repository.completeRefundReconciliation({
          orderId:order.id,amountCents:request.amountCents,adminUid,
          expectedStatus:order.status,
          expectedRefundedAmountCents:existingRefundedAmountCents,
          cumulativeRefundedAmountCents:normalizedRefunds.cumulativeRefundedAmountCents,
          evidenceId:normalizedRefunds.evidenceId,
          orderBinding:refundOrderBinding(order),
          reviewId:refundReviewIdempotencyKey(request),
        });
      } catch {
        return preserveForManualReview('refund_state_conflict');
      }
      if (!completed?.completed) {
        const current = await repository.getOrder(order.id);
        return Object.freeze({
          orderHandle:order.id,
          status:['paid','fulfilled'].includes(current?.status) ? current.status : order.status,
          reconciliation:'manual_review',
        });
      }
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

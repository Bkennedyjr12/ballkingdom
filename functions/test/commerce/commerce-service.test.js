import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCommerceService} from '../../src/commerce/commerce-service.js';

const pilotEmail = 'approved-pilot@example.test';
const pilotBinding = createHash('sha256').update(`binding\0${pilotEmail}`).digest('hex');
const catalogItem = Object.freeze({
  sku:'home-inspection-study-guide',
  name:'Home Inspection Study Guide',
  amountCents:4900,
  currency:'USD',
  orderType:'digital_product',
  fulfillmentType:'protected_download',
  active:true,
});

function createMemoryRepository() {
  const orders = new Map();
  const reservations = new Map();
  const effects = new Map();
  const authEffects = new Map();
  const fulfillmentGrants = new Map();
  const webhookHints = new Map();
  const disabledAudits = [];
  const operatorAlerts = [];
  let claimSequence = 0;

  function orderEffect(orderId, effect) {
    return effects.get(`${orderId}:${effect}`);
  }

  return {
    orders,
    effects,
    authEffects,
    fulfillmentGrants,
    webhookHints,
    disabledAudits,
    operatorAlerts,
    async createReservedDigitalOrder({recipientBinding, orderId, order}) {
      const key = `${recipientBinding}:${order.sku}`;
      const existingId = reservations.get(key);
      if (existingId) {
        const existing = orders.get(existingId);
        if (existing.customerUid !== order.customerUid) {
          const error = new Error('reservation conflict');
          error.code = 'ORDER_RESERVATION_CONFLICT';
          throw error;
        }
        return {orderId:existingId,idempotencyKey:`bk-order-${existingId}`,duplicate:true};
      }
      reservations.set(key, orderId);
      orders.set(orderId, {
        id:orderId,
        ...structuredClone(order),
        providerRefs:{},
        terminal:false,
        reconciliationDueAt:new Date(),
        fulfillment:{status:'locked'},
      });
      effects.set(`${orderId}:invoice_create`, {effect:'invoice_create',status:'pending',claim:null});
      effects.set(`${orderId}:invoice_send`, {
        effect:'invoice_send',status:'pending',claim:null,dispatchAttemptCount:0,dispatchStartedAt:null,
      });
      return {orderId,idempotencyKey:`bk-order-${orderId}`,duplicate:false};
    },
    async getOrder(orderId) {
      return orders.get(orderId) ?? null;
    },
    async getEffect(orderId, effect) {
      return orderEffect(orderId, effect) ?? null;
    },
    async claimEffect(orderId, effect, workerId, now) {
      const current = orderEffect(orderId, effect);
      const order = orders.get(orderId);
      if (!current || current.status !== 'pending') return false;
      if (effect === 'invoice_send' && !order.providerRefs.invoiceId) return false;
      const claimId = `claim-${++claimSequence}`;
      current.status = 'claimed';
      current.claim = {claimId,workerId,leaseExpiresAt:new Date(now.getTime() + 300000)};
      return {claimId};
    },
    async markEffectDispatchStarted(orderId, effect, workerId, claimId, now) {
      const current = orderEffect(orderId, effect);
      if (current.claim?.claimId !== claimId || current.claim.workerId !== workerId) throw new Error('lost');
      current.dispatchStartedAt = now;
      current.dispatchAttemptCount = 1;
      return true;
    },
    async completeEffect(orderId, effect, workerId, claimId, result = {}) {
      const current = orderEffect(orderId, effect);
      if (current.status === 'completed' && current.lastClaimId === claimId) return false;
      if (current.claim?.claimId !== claimId || current.claim.workerId !== workerId) throw new Error('lost');
      if (effect === 'invoice_create') Object.assign(orders.get(orderId).providerRefs, result.providerRefs);
      current.status = 'completed';
      current.claim = null;
      current.lastClaimId = claimId;
      return true;
    },
    async recordEffectFailure(orderId, effect, workerId, claimId) {
      const current = orderEffect(orderId, effect);
      if (current.claim?.claimId !== claimId || current.claim.workerId !== workerId) throw new Error('lost');
      if (effect === 'invoice_send' && current.dispatchStartedAt) {
        current.status = 'manual_review';
        current.claim = null;
        current.lastErrorCode = 'invoice_send_unknown';
        Object.assign(orders.get(orderId), {status:'manual_review',terminal:true,lastErrorCode:'invoice_send_unknown'});
      } else {
        current.status = 'pending';
        current.claim = null;
      }
      return true;
    },
    async createPilotAuthEmailEffect(binding) {
      if (authEffects.has(binding)) return false;
      authEffects.set(binding, {
        effect:'pilot_auth_email',status:'pending',claim:null,dispatchStartedAt:null,dispatchAttemptCount:0,
      });
      return true;
    },
    async recordPilotAuthRequestAllowedDisabled() {
      disabledAudits.push({event:'pilot_auth_request_allowed_disabled'});
    },
    async claimPilotAuthEmailEffect(binding, workerId, now) {
      const effect = authEffects.get(binding);
      if (!effect || effect.status !== 'pending' || effect.dispatchAttemptCount !== 0) return false;
      const claimId = `claim-${++claimSequence}`;
      effect.status = 'claimed';
      effect.claim = {claimId,workerId,leaseExpiresAt:new Date(now.getTime() + 300000)};
      return {claimId};
    },
    async markPilotAuthDispatchStarted(binding, workerId, claimId, now) {
      const effect = authEffects.get(binding);
      if (effect.claim?.claimId !== claimId || effect.claim.workerId !== workerId) throw new Error('lost');
      effect.dispatchStartedAt = now;
      effect.dispatchAttemptCount = 1;
      return true;
    },
    async completePilotAuthEmailEffect(binding, workerId, claimId) {
      const effect = authEffects.get(binding);
      if (effect.status === 'completed' && effect.lastClaimId === claimId) return false;
      if (effect.claim?.claimId !== claimId || effect.claim.workerId !== workerId) throw new Error('lost');
      effect.status = 'completed';
      effect.claim = null;
      effect.lastClaimId = claimId;
      return true;
    },
    async recordPilotAuthEmailFailure(binding, workerId, claimId) {
      const effect = authEffects.get(binding);
      if (effect.claim?.claimId !== claimId || effect.claim.workerId !== workerId) throw new Error('lost');
      if (effect.dispatchStartedAt) {
        effect.status = 'manual_review';
        effect.claim = null;
        effect.lastErrorCode = 'pilot_auth_email_unknown';
      }
      return true;
    },
    async claimTransition(orderId, transition, workerId) {
      const order = orders.get(orderId);
      if (!order || order.activeTransition || order.status === transition) return false;
      const claimId = `claim-${++claimSequence}`;
      order.activeTransition = {claimId,workerId,transition,previousStatus:order.status};
      order.status = transition;
      return {claimId,revision:claimSequence};
    },
    async completeTransition(orderId, transition, workerId, claimId, result = {}) {
      const order = orders.get(orderId);
      if (order.activeTransition?.claimId !== claimId || order.activeTransition.workerId !== workerId) return false;
      order.activeTransition = null;
      order.reconciliationDueAt = result.reconciliationDueAt ?? null;
      Object.assign(order.providerRefs, result.providerRefs ?? {});
      if (['fulfilled','manual_review'].includes(transition)) order.terminal = true;
      return true;
    },
    async recordFailure(orderId, transition, workerId, claimId, failure) {
      const order = orders.get(orderId);
      if (order.activeTransition?.claimId !== claimId || order.activeTransition.workerId !== workerId) return false;
      order.status = order.activeTransition.previousStatus;
      order.activeTransition = null;
      order.retry = {attemptCount:Number(order.retry?.attemptCount ?? 0) + 1,dueAt:failure.retryAt};
      order.reconciliationDueAt = failure.retryAt;
      order.lastErrorCode = failure.code;
      return true;
    },
    async claimPaymentVerification(orderId, workerId, now) {
      const order = orders.get(orderId);
      if (!order || !['pending_payment','payment_verifying','paid','fulfilling'].includes(order.status)) return false;
      if (order.paymentVerificationClaim?.leaseExpiresAt > now) return false;
      const claimId = `claim-${++claimSequence}`;
      order.paymentVerificationClaim = {
        claimId,workerId,claimedAt:now,leaseExpiresAt:new Date(now.getTime() + 300000),
      };
      order.reconciliationDueAt = order.paymentVerificationClaim.leaseExpiresAt;
      return {claimId};
    },
    async completeVerifiedDigitalOrder(orderId, workerId, claimId, providerRefs = {}) {
      const order = orders.get(orderId);
      if (order?.status === 'fulfilled' && order.lastPaymentVerificationClaimId === claimId) return false;
      if (order?.paymentVerificationClaim?.claimId !== claimId
        || order.paymentVerificationClaim.workerId !== workerId) throw new Error('lost payment claim');
      Object.assign(order.providerRefs, providerRefs);
      if (!fulfillmentGrants.has(orderId)) {
        fulfillmentGrants.set(orderId, {
          orderId,sku:order.sku,customerUid:order.customerUid,
          fulfillmentType:order.fulfillmentType,status:'active',
        });
      }
      order.status = 'fulfilled';
      order.terminal = true;
      order.activeTransition = null;
      order.paymentVerificationClaim = null;
      order.lastPaymentVerificationClaimId = claimId;
      order.reconciliationDueAt = null;
      return true;
    },
    async completePaymentVerification(orderId, workerId, claimId, {outcome,retryAt,errorCode} = {}) {
      const order = orders.get(orderId);
      if (order?.paymentVerificationClaim?.claimId !== claimId
        || order.paymentVerificationClaim.workerId !== workerId) throw new Error('lost payment claim');
      order.paymentVerificationClaim = null;
      order.activeTransition = null;
      if (outcome === 'manual_review') {
        order.status = 'manual_review'; order.terminal = true;
        order.reconciliationDueAt = null; order.lastErrorCode = errorCode;
      } else {
        order.status = 'pending_payment'; order.terminal = false;
        order.reconciliationDueAt = retryAt; order.lastErrorCode = errorCode ?? null;
      }
      return true;
    },
    async recordPendingEffectFailure(descriptor, {code,terminal} = {}, now = new Date()) {
      const entry = descriptor.effect === 'pilot_auth_email'
        ? [...authEffects.entries()].find(([,effect]) => effect.effectId === descriptor.effectId)
        : [...effects.entries()].find(([,effect]) => effect.effectId === descriptor.effectId);
      const current = entry?.[1];
      if (!current || current.status !== 'pending') return false;
      current.attemptCount = Math.min(Number(current.attemptCount ?? 0) + 1, 8);
      current.lastErrorCode = code;
      if (terminal || current.attemptCount >= 8) {
        current.status = 'manual_review';
        current.nextAttemptAt = null;
        operatorAlerts.push({code,orderId:descriptor.orderId});
      } else {
        current.nextAttemptAt = new Date(now.getTime() + 5 * 60 * 1000 * (2 ** (current.attemptCount - 1)));
      }
      return true;
    },
    async recoverExpiredEffects(now) {
      const result = {
        recoveredCreateOrderIds:[],recoveredPilotAuthBindings:[],
        recoveredSendOrderIds:[],manualReviewOrderIds:[],manualReviewPilotAuthBindings:[],
      };
      for (const [binding, effect] of authEffects) {
        if (effect.status !== 'claimed' || effect.claim.leaseExpiresAt > now) continue;
        if (effect.dispatchStartedAt) {
          effect.status = 'manual_review'; effect.claim = null;
          effect.lastErrorCode = 'pilot_auth_email_unknown';
          result.manualReviewPilotAuthBindings.push(binding);
        } else {
          effect.status = 'pending'; effect.claim = null;
          result.recoveredPilotAuthBindings.push(binding);
        }
      }
      for (const [key, effect] of effects) {
        if (effect.status !== 'claimed' || effect.claim.leaseExpiresAt > now) continue;
        const orderId = key.split(':')[0];
        if (effect.effect === 'invoice_create') {
          effect.status = 'pending'; effect.claim = null; result.recoveredCreateOrderIds.push(orderId);
        } else {
          effect.status = 'manual_review'; effect.claim = null;
          Object.assign(orders.get(orderId), {status:'manual_review',terminal:true,lastErrorCode:'invoice_send_unknown'});
          result.manualReviewOrderIds.push(orderId);
        }
      }
      return result;
    },
    async listDueEffects(now, {limit}) {
      const result = [];
      for (const [binding, effect] of authEffects) {
        if (effect.status === 'pending' && (!effect.nextAttemptAt || effect.nextAttemptAt <= now)) {
          effect.effectId ??= `pilot-auth-${binding}`;
          result.push({effectId:effect.effectId,effect:'pilot_auth_email',recipientBinding:binding});
        }
      }
      for (const [key, effect] of effects) {
        if (effect.status !== 'pending' || (effect.nextAttemptAt && effect.nextAttemptAt > now)) continue;
        effect.effectId ??= key;
        result.push({effectId:effect.effectId,effect:effect.effect,orderId:key.split(':')[0]});
      }
      return result.slice(0, limit);
    },
    async storeWebhookHints(entries) {
      for (const {id,hint} of entries) webhookHints.set(id,{hintId:id,...structuredClone(hint)});
      return entries.length;
    },
    async listReconciliationHints(now, {limit,ttlMs}) {
      const cutoff = now.getTime() - ttlMs;
      return [...webhookHints.values()]
        .filter(hint => Date.parse(hint.lastUpdated) >= cutoff)
        .sort((left,right) => left.lastUpdated.localeCompare(right.lastUpdated))
        .slice(0,limit);
    },
    async consumeReconciliationHints(ids) {
      for (const id of ids) webhookHints.delete(id);
      return ids.length;
    },
    async purgeExpiredWebhookHints(now, {limit,ttlMs}) {
      const expired = [...webhookHints.values()]
        .filter(hint => Date.parse(hint.lastUpdated) <= now.getTime() - ttlMs)
        .slice(0,limit);
      for (const hint of expired) webhookHints.delete(hint.hintId);
      return expired.length;
    },
    async findOrderByInvoiceId(realmId, invoiceId) {
      return [...orders.values()].find(order => (
        order.providerRefs.realmId === realmId && order.providerRefs.invoiceId === invoiceId
      )) ?? null;
    },
    async listReconciliationCandidates(now, {limit}) {
      return [...orders.values()].filter(order => !order.terminal && order.reconciliationDueAt <= now).slice(0, limit);
    },
  };
}

function unpaidEvidence(orderId = 'order-1') {
  return {
    realmId:'realm-1',
    invoice:{
      invoiceId:'invoice-1',providerOrderRef:`bk-order-${orderId}`,
      totalAmountCents:4900,balanceCents:4900,currency:'USD',
      entityState:'present',paymentState:'unpaid',
    },
    payments:[],
  };
}

function paidEvidence(orderId = 'order-1') {
  return {
    realmId:'realm-1',
    invoice:{
      invoiceId:'invoice-1',providerOrderRef:`bk-order-${orderId}`,
      totalAmountCents:4900,balanceCents:0,currency:'USD',
      entityState:'present',paymentState:'paid',
    },
    payments:[{
      providerPaymentRef:'payment-1',entityState:'present',totalAmountCents:4900,
      unappliedAmountCents:0,
      applications:[{linkedTxnId:'invoice-1',linkedTxnType:'Invoice',amountCents:4900}],
    }],
  };
}

function crashOnceAfter(repository, method) {
  const original = repository[method].bind(repository);
  let crashed = false;
  repository[method] = async (...args) => {
    const result = await original(...args);
    if (!crashed) {
      crashed = true;
      const error = new Error(`synthetic crash after ${method}`);
      error.code = 'SYNTHETIC_CRASH';
      throw error;
    }
    return result;
  };
}

function fixture(overrides = {}) {
  const repository = overrides.repository ?? createMemoryRepository();
  const calls = {create:[],send:[],invoice:[],cdc:[],graph:[],links:[],fulfill:[],alerts:[]};
  const quickbooks = overrides.quickbooks ?? {
    async createCommerceInvoice(order) {
      calls.create.push(structuredClone(order));
      return {customerId:'customer-1',invoiceId:'invoice-1',documentNumber:'1001'};
    },
    async sendInvoice(input) {
      calls.send.push(structuredClone(input));
      return {invoiceId:input.invoiceId,sendAccepted:true};
    },
    async getInvoice(invoiceId) {
      calls.invoice.push(invoiceId);
      const orderId = [...repository.orders.values()].find(order => order.providerRefs.invoiceId === invoiceId)?.id ?? 'order-1';
      return unpaidEvidence(orderId);
    },
    async getAccountingChanges(input) { calls.cdc.push(input); return {realmId:'realm-1',changes:[]}; },
  };
  const graph = overrides.graph ?? {
    async sendPilotAuthLink(input) { calls.graph.push(structuredClone(input)); return {accepted:true}; },
  };
  const auth = overrides.auth ?? {
    async generateSignInWithEmailLink(email) {
      calls.links.push(email);
      return 'https://ballkingdom.com/finish-sign-in?mode=signIn&oobCode=synthetic';
    },
  };
  const flags = overrides.flags ?? {digitalInvoicePilotEnabled:true,serviceQboSendEnabled:false};
  const getCurrentUser = overrides.getCurrentUser ?? (async uid => ({
    uid,
    email:pilotEmail,
    emailVerified:true,
    disabled:false,
    tokensValidAfterTime:'2026-08-29T17:00:00.000Z',
  }));
  let idSequence = 0;
  const service = createCommerceService({
    repository,
    quickbooks,
    graph,
    auth,
    getCommerceItem: overrides.getCommerceItem ?? (() => catalogItem),
    readFeatureFlags: () => flags,
    getApprovedPilotEmail: overrides.getApprovedPilotEmail
      ?? (() => overrides.approvedPilotEmail ?? pilotEmail),
    getCurrentUser,
    fulfillDigitalOrder: async order => { calls.fulfill.push(order.id); return {fulfilled:true}; },
    alertOperator: async receipt => { calls.alerts.push(receipt); },
    authRequestLimiter:overrides.authRequestLimiter,
    statusRequestLimiter:overrides.statusRequestLimiter,
    idFactory: () => `order-${++idSequence}`,
    workerIdFactory: purpose => `${purpose}-worker`,
    clock: overrides.clock ?? (() => new Date('2026-08-29T18:00:00.000Z')),
  });
  return {service,repository,quickbooks,graph,auth,calls,flags};
}

const ownerAuth = Object.freeze({
  uid:'customer-uid',
  email:pilotEmail,
  emailVerified:true,
  token:Object.freeze({
    email:pilotEmail,
    email_verified:true,
    auth_time:1788026400,
    iat:1788026400,
    firebase:Object.freeze({sign_in_provider:'emailLink'}),
  }),
});
const appCheck = Object.freeze({app:{appId:'test-app'}});

test('returns one generic auth-link result while suppressing mismatched and disabled delivery', async () => {
  const enabled = fixture();
  const mismatch = await enabled.service.requestPilotSignInLink({email:'other@example.test'}, appCheck);
  assert.deepEqual(mismatch, {status:'request_received'});
  assert.equal(enabled.calls.links.length, 0);
  assert.equal(enabled.calls.graph.length, 0);

  const disabled = fixture({flags:{digitalInvoicePilotEnabled:false,serviceQboSendEnabled:false}});
  const result = await disabled.service.requestPilotSignInLink({email:pilotEmail}, appCheck);
  assert.deepEqual(result, mismatch);
  assert.equal(disabled.calls.graph.length, 0);
  assert.equal(disabled.repository.authEffects.size, 0);
  assert.deepEqual(disabled.repository.disabledAudits, [{event:'pilot_auth_request_allowed_disabled'}]);
});

test('approved email link returns to the exact gated product route', async () => {
  let captured;
  const state=fixture({auth:{async generateSignInWithEmailLink(email,settings){captured={email,settings};return 'https://example.test/synthetic';}}});
  assert.deepEqual(await state.service.requestPilotSignInLink({email:pilotEmail},appCheck),{status:'request_received'});
  assert.equal(captured.email,pilotEmail);
  assert.deepEqual(captured.settings,{
    url:'https://ballkingdom.com/order-status.html?sku=home-inspection-study-guide',
    handleCodeInApp:true,
  });
});

test('mismatched auth-link candidates make no persistence, limiter, Admin, or Graph call', async () => {
  const limiterKeys = [];
  const state = fixture({authRequestLimiter:async key => { limiterKeys.push(key); return true; }});

  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(
      await state.service.requestPilotSignInLink({email:`other-${index}@example.test`}, appCheck),
      {status:'request_received'}
    );
  }

  assert.deepEqual(limiterKeys, []);
  assert.equal(state.repository.authEffects.size, 0);
  assert.equal(state.repository.disabledAudits.length, 0);
  assert.equal(state.calls.links.length, 0);
  assert.equal(state.calls.graph.length, 0);
});

test('approved auth-link requests use one fixed digest limiter key', async () => {
  const limiterKeys = [];
  const state = fixture({authRequestLimiter:async key => { limiterKeys.push(key); return true; }});

  await state.service.requestPilotSignInLink({email:pilotEmail}, appCheck);
  await state.service.requestPilotSignInLink({email:` ${pilotEmail.toUpperCase()} `}, appCheck);

  assert.equal(limiterKeys.length, 2);
  assert.equal(limiterKeys[0], 'c78db3288be6be09f6f78c2a95a459ae245eaf1e099cd5db392fdd8e893df03a');
  assert.equal(limiterKeys[1], limiterKeys[0]);
});

test('queues and dispatches the approved pilot auth email once across parallel requests', async () => {
  const {service,calls,repository} = fixture();
  const results = await Promise.all([
    service.requestPilotSignInLink({email:`  ${pilotEmail.toUpperCase()} `}, appCheck),
    service.requestPilotSignInLink({email:pilotEmail}, appCheck),
  ]);

  assert.deepEqual(results, [{status:'request_received'},{status:'request_received'}]);
  assert.equal(repository.authEffects.size, 1);
  assert.equal(calls.links.length, 1);
  assert.equal(calls.graph.length, 1);
  assert.equal(calls.graph[0].to, pilotEmail);
  assert.equal(Object.hasOwn(results[0], 'link'), false);
});

test('quarantines an ambiguous auth dispatch and never sends it again', async () => {
  let attempts = 0;
  const graph = {async sendPilotAuthLink() { attempts += 1; throw new Error('timeout'); }};
  const state = fixture({graph});

  await state.service.requestPilotSignInLink({email:pilotEmail}, appCheck);
  await state.service.requestPilotSignInLink({email:pilotEmail}, appCheck);

  assert.equal(attempts, 1);
  assert.equal([...state.repository.authEffects.values()][0].status, 'manual_review');
  assert.equal([...state.repository.authEffects.values()][0].lastErrorCode, 'pilot_auth_email_unknown');
  assert.deepEqual(state.calls.alerts, []);
});

test('reclaims a pre-dispatch auth lease only after expiry and then delivers once', async () => {
  let now = new Date('2026-08-29T18:00:00.000Z');
  let generationAttempts = 0;
  const auth = {
    async generateSignInWithEmailLink() {
      generationAttempts += 1;
      if (generationAttempts === 1) throw new Error('generation unavailable');
      return 'https://ballkingdom.com/finish-sign-in?mode=signIn&oobCode=synthetic';
    },
  };
  const state = fixture({auth,clock:() => now});
  await state.service.requestPilotSignInLink({email:pilotEmail}, appCheck);
  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:04:59.999Z'));
  assert.equal(state.calls.graph.length, 0);

  now = new Date('2026-08-29T18:05:00.000Z');
  await state.service.reconcilePendingOrders(now);

  assert.equal(generationAttempts, 2);
  assert.equal(state.calls.graph.length, 1);
  assert.equal([...state.repository.authEffects.values()][0].status, 'completed');
});

test('denies digital ordering while its independent feature flag is false', async () => {
  const state = fixture({flags:{digitalInvoicePilotEnabled:false,serviceQboSendEnabled:false}});
  await assert.rejects(
    state.service.createDigitalOrder({
      sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
    }, ownerAuth),
    {code:'COMMERCE_DISABLED'}
  );
  assert.equal(state.calls.create.length, 0);
  assert.equal(state.calls.send.length, 0);
});

test('requires a verified allowlisted token and ignores client UID, email, and amount', async () => {
  const state = fixture();
  await assert.rejects(
    state.service.createDigitalOrder({sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'x'}, null),
    {code:'AUTH_REQUIRED'}
  );
  await assert.rejects(
    state.service.createDigitalOrder({sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'x'}, {...ownerAuth,emailVerified:false}),
    {code:'VERIFIED_EMAIL_REQUIRED'}
  );
  await assert.rejects(
    state.service.createDigitalOrder({sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'x'}, {...ownerAuth,email:'other@example.test'}),
    {code:'AUTH_SESSION_INVALID'}
  );

  const result = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
    amountCents:1,uid:'attacker',email:'attacker@example.test',
  }, ownerAuth);

  assert.equal(result.amountCents, catalogItem.amountCents);
  assert.equal(state.calls.create[0].amountCents, catalogItem.amountCents);
  const order = state.repository.orders.get(result.orderHandle);
  assert.equal(order.customerUid, ownerAuth.uid);
  assert.deepEqual(order.customer, {name:'Ada'});
  assert.match(order.authorizedRecipientBinding, /^[a-f0-9]{64}$/);
  assert.equal(state.calls.create[0].customer.email, pilotEmail);
});

test('create and status reject deleted, disabled, revoked, reused-link, and stale authoritative users', async () => {
  const validUser = {
    uid:ownerAuth.uid,email:pilotEmail,emailVerified:true,disabled:false,
    tokensValidAfterTime:'2026-08-29T17:00:00.000Z',
  };
  const cases = [
    ['deleted', async () => { const error = new Error('missing'); error.code = 'auth/user-not-found'; throw error; }],
    ['disabled', async () => ({...validUser,disabled:true})],
    ['revoked', async () => ({...validUser,tokensValidAfterTime:'2026-08-29T19:00:00.000Z'})],
    ['reused-link', async () => ({...validUser,tokensValidAfterTime:'2026-08-29T18:00:00.001Z'})],
    ['stale-binding', async () => ({...validUser,email:'changed@example.test'})],
  ];

  for (const [name, getCurrentUser] of cases) {
    const state = fixture({getCurrentUser});
    await assert.rejects(
      state.service.createDigitalOrder({
        sku:catalogItem.sku,customerName:'Ada',idempotencyKey:`case-${name}`,
      }, ownerAuth),
      {code:'AUTH_SESSION_INVALID'},
      name
    );
    assert.equal(state.calls.create.length, 0, name);
    assert.equal(state.repository.orders.size, 0, name);
  }

  let currentUser = validUser;
  const state = fixture({getCurrentUser:async () => currentUser});
  const created = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'valid-owner',
  }, ownerAuth);
  currentUser = {...validUser,disabled:true};
  await assert.rejects(
    state.service.getOrderStatus({orderHandle:created.orderHandle}, ownerAuth),
    {code:'AUTH_SESSION_INVALID'}
  );
});

test('creates and sends one server-priced invoice without returning a pay URL', async () => {
  const state = fixture();
  const [first, second] = await Promise.all([
    state.service.createDigitalOrder({
      sku:catalogItem.sku,customerName:'Ada',amountCents:1,idempotencyKey:'order-1',
    }, ownerAuth),
    state.service.createDigitalOrder({
      sku:catalogItem.sku,customerName:'Ada',amountCents:999999,idempotencyKey:'order-2',
    }, ownerAuth),
  ]);

  assert.deepEqual(first, {
    orderHandle:'order-1',amountCents:catalogItem.amountCents,currency:'USD',
    status:'payment_verification_pending',
    message:'QuickBooks sent payment instructions to your email.',
  });
  assert.equal(second.orderHandle, first.orderHandle);
  assert.equal(Object.hasOwn(first, 'url'), false);
  assert.equal(state.calls.create.length, 1);
  assert.equal(state.calls.send.length, 1);
  assert.equal(state.calls.fulfill.length, 0);
  assert.equal(state.flags.serviceQboSendEnabled, false);
});

test('rejects service catalog items from the digital path', async () => {
  const state = fixture({getCommerceItem:() => ({...catalogItem,orderType:'service'})});
  await assert.rejects(
    state.service.createDigitalOrder({
      sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
    }, ownerAuth),
    {code:'DIGITAL_PRODUCT_REQUIRED'}
  );
  assert.equal(state.calls.create.length, 0);
});

test('turns an invoice-send timeout into manual review and makes no second send call', async () => {
  let attempts = 0;
  const quickbooks = {
    async createCommerceInvoice() { return {customerId:'customer-1',invoiceId:'invoice-1'}; },
    async getInvoice() { return unpaidEvidence('order-1'); },
    async sendInvoice() { attempts += 1; throw new Error('timeout'); },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  };
  const state = fixture({quickbooks});

  await assert.rejects(state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth), {code:'ORDER_MANUAL_REVIEW'});
  await assert.rejects(state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-2',
  }, ownerAuth), {code:'ORDER_MANUAL_REVIEW'});

  assert.equal(attempts, 1);
  assert.equal(state.repository.orders.get('order-1').status, 'manual_review');
});

test('recovers a stale create lease through the deterministic order reference without another order', async () => {
  let now = new Date('2026-08-29T18:00:00.000Z');
  let createAttempts = 0;
  const repository = createMemoryRepository();
  const quickbooks = {
    async createCommerceInvoice() {
      createAttempts += 1;
      if (createAttempts === 1) {
        const error = new Error('timeout'); error.code = 'PROVIDER_TIMEOUT'; throw error;
      }
      return {customerId:'customer-1',invoiceId:'invoice-1'};
    },
    async getInvoice() { return unpaidEvidence('order-1'); },
    async sendInvoice(input) { return {invoiceId:input.invoiceId,sendAccepted:true}; },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  };
  const state = fixture({repository,quickbooks,clock:() => now});
  await assert.rejects(state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth), {code:'ORDER_PROCESSING_PENDING'});
  now = new Date('2026-08-29T18:05:00.000Z');

  await state.service.reconcilePendingOrders(now);

  assert.equal(createAttempts, 2);
  assert.equal(repository.orders.size, 1);
  assert.equal([...repository.effects.values()].filter(effect => effect.effect === 'invoice_send' && effect.status === 'completed').length, 1);
});

test('recovers an already-bound Invoice by exact readback before considering another create', async () => {
  let now = new Date('2026-08-29T18:00:00.000Z');
  const repository = createMemoryRepository();
  await repository.createReservedDigitalOrder({
    recipientBinding:pilotBinding,
    orderId:'order-1',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',
      customer:{name:'Ada'},customerUid:'customer-uid',
      authorizedRecipientBinding:pilotBinding,status:'pending_payment',
    },
  });
  await repository.claimEffect('order-1','invoice_create','stale-worker',now);
  Object.assign(repository.orders.get('order-1').providerRefs, {
    realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-1',
  });
  let creates = 0;
  let sends = 0;
  const quickbooks = {
    async createCommerceInvoice() { creates += 1; throw new Error('must not create'); },
    async getInvoice() { return unpaidEvidence('order-1'); },
    async sendInvoice(input) { sends += 1; return {invoiceId:input.invoiceId,sendAccepted:true}; },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  };
  const state = fixture({repository,quickbooks,clock:() => now});
  now = new Date('2026-08-29T18:05:00.000Z');

  await state.service.reconcilePendingOrders(now);

  assert.equal(creates, 0);
  assert.equal(sends, 1);
});

test('scheduled recovery quarantines an expired invoice-send lease without another provider send', async () => {
  let now = new Date('2026-08-29T18:00:00.000Z');
  const repository = createMemoryRepository();
  await repository.createReservedDigitalOrder({
    recipientBinding:pilotBinding,orderId:'order-1',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',
      customer:{name:'Ada'},customerUid:'customer-uid',
      authorizedRecipientBinding:pilotBinding,status:'pending_payment',
    },
  });
  Object.assign(repository.orders.get('order-1').providerRefs, {
    realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-1',
  });
  repository.effects.get('order-1:invoice_create').status = 'completed';
  const sendClaim = await repository.claimEffect('order-1','invoice_send','stale-worker',now);
  await repository.markEffectDispatchStarted(
    'order-1','invoice_send','stale-worker',sendClaim.claimId,new Date('2026-08-29T18:00:01.000Z')
  );
  let sends = 0;
  const quickbooks = {
    async createCommerceInvoice() { throw new Error('must not create'); },
    async getInvoice() { return unpaidEvidence('order-1'); },
    async sendInvoice() { sends += 1; return {invoiceId:'invoice-1',sendAccepted:true}; },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  };
  const state = fixture({repository,quickbooks,clock:() => now});
  now = new Date('2026-08-29T18:05:00.000Z');

  await state.service.reconcilePendingOrders(now);

  assert.equal(sends, 0);
  assert.equal(repository.orders.get('order-1').status, 'manual_review');
  assert.deepEqual(state.calls.alerts, []);
});

test('scheduled dispatcher sends a newly pending auth effect without waiting for an expired lease', async () => {
  const state = fixture();
  const binding = pilotBinding;
  await state.repository.createPilotAuthEmailEffect(binding);

  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:00:00.000Z'));

  assert.equal(state.calls.links.length, 1);
  assert.equal(state.calls.graph.length, 1);
  assert.equal(state.repository.authEffects.get(binding).status, 'completed');
});

test('scheduled dispatcher sends one pending Invoice with a durable ID even when the order is not due', async () => {
  const repository = createMemoryRepository();
  await repository.createReservedDigitalOrder({
    recipientBinding:pilotBinding,orderId:'order-1',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
      customerUid:'customer-uid',authorizedRecipientBinding:pilotBinding,status:'pending_payment',
    },
  });
  Object.assign(repository.orders.get('order-1'), {
    reconciliationDueAt:new Date('2026-08-30T18:00:00.000Z'),
  });
  Object.assign(repository.orders.get('order-1').providerRefs, {
    realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-1',
  });
  repository.effects.get('order-1:invoice_create').status = 'completed';
  let sends = 0;
  const state = fixture({repository,quickbooks:{
    async createCommerceInvoice() { throw new Error('must not create'); },
    async getInvoice() { return unpaidEvidence('order-1'); },
    async sendInvoice(input) { sends += 1; return {invoiceId:input.invoiceId,sendAccepted:true}; },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  }});

  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:00:00.000Z'));
  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:00:01.000Z'));

  assert.equal(sends, 1);
  assert.equal(repository.effects.get('order-1:invoice_send').status, 'completed');
});

test('expired pre-dispatch Invoice send is quarantined and can never be dispatched', async () => {
  let now = new Date('2026-08-29T18:00:00.000Z');
  const repository = createMemoryRepository();
  await repository.createReservedDigitalOrder({
    recipientBinding:pilotBinding,orderId:'order-1',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
      customerUid:'customer-uid',authorizedRecipientBinding:pilotBinding,status:'pending_payment',
    },
  });
  Object.assign(repository.orders.get('order-1').providerRefs, {
    realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-1',
  });
  repository.effects.get('order-1:invoice_create').status = 'completed';
  await repository.claimEffect('order-1','invoice_send','crashed-before-dispatch',now);
  let sends = 0;
  const state = fixture({repository,clock:() => now,quickbooks:{
    async createCommerceInvoice() { throw new Error('must not create'); },
    async getInvoice() { return unpaidEvidence('order-1'); },
    async sendInvoice(input) { sends += 1; return {invoiceId:input.invoiceId,sendAccepted:true}; },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  }});
  now = new Date('2026-08-29T18:05:00.000Z');

  await state.service.reconcilePendingOrders(now);
  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:05:01.000Z'));

  assert.equal(sends, 0);
  assert.equal(repository.effects.get('order-1:invoice_send').status, 'manual_review');
  assert.equal(repository.orders.get('order-1').status, 'manual_review');
});

test('dispatcher quarantines a poisoned oldest page so later valid effects cannot starve', async () => {
  const repository = createMemoryRepository();
  for (let index = 0; index < 50; index += 1) {
    repository.effects.set(`missing-${index}:invoice_create`, {
      effect:'invoice_create',status:'pending',claim:null,attemptCount:0,
      nextAttemptAt:new Date('2026-08-29T17:00:00.000Z'),
    });
  }
  await repository.createReservedDigitalOrder({
    recipientBinding:pilotBinding,orderId:'order-1',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
      customerUid:'customer-uid',authorizedRecipientBinding:pilotBinding,status:'pending_payment',
    },
  });
  const state = fixture({repository});
  const at = new Date('2026-08-29T18:00:00.000Z');

  await state.service.dispatchPendingEffects(at);
  await state.service.dispatchPendingEffects(at);

  assert.equal([...repository.effects.values()].filter(effect => (
    effect.status === 'manual_review' && effect.lastErrorCode === 'commerce_effect_order_missing'
  )).length, 50);
  assert.equal(repository.effects.get('order-1:invoice_create').status, 'completed');
  assert.equal(repository.effects.get('order-1:invoice_send').status, 'completed');
  assert.equal(state.calls.create.length, 1);
  assert.equal(state.calls.send.length, 1);
});

test('dispatcher quarantines every pending effect for a mismatched or manual-review order', async () => {
  for (const scenario of ['binding_mismatch','already_manual']) {
    const repository = createMemoryRepository();
    await repository.createReservedDigitalOrder({
      recipientBinding:scenario === 'binding_mismatch' ? 'a'.repeat(64) : pilotBinding,
      orderId:`order-${scenario}`,
      order:{
        sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
        orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
        customerUid:'customer-uid',
        authorizedRecipientBinding:scenario === 'binding_mismatch' ? 'a'.repeat(64) : pilotBinding,
        status:'pending_payment',
      },
    });
    if (scenario === 'already_manual') {
      Object.assign(repository.orders.get(`order-${scenario}`), {status:'manual_review',terminal:true});
    }
    const state = fixture({repository});

    await state.service.dispatchPendingEffects(new Date('2026-08-29T18:00:00.000Z'));

    assert.deepEqual(
      [...repository.effects.values()].map(effect => effect.status),
      ['manual_review','manual_review'],
      scenario
    );
    assert.equal(state.calls.create.length, 0, scenario);
    assert.equal(state.calls.send.length, 0, scenario);
  }
});

test('dispatcher backs off every pending effect after an unexpected pre-dispatch error', async () => {
  const repository = createMemoryRepository();
  await repository.createReservedDigitalOrder({
    recipientBinding:pilotBinding,orderId:'order-unavailable',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
      customerUid:'customer-uid',authorizedRecipientBinding:pilotBinding,status:'pending_payment',
    },
  });
  const state = fixture({
    repository,
    getApprovedPilotEmail:() => { throw new Error('synthetic configuration failure'); },
  });
  const at = new Date('2026-08-29T18:00:00.000Z');

  await state.service.dispatchPendingEffects(at);

  for (const effect of repository.effects.values()) {
    assert.equal(effect.status, 'pending');
    assert.equal(effect.lastErrorCode, 'commerce_effect_dispatch_unavailable');
    assert.equal(effect.nextAttemptAt > at, true);
  }
  assert.equal((await repository.listDueEffects(at, {limit:50})).length, 0);
});

test('authoritative exact payment evidence fulfills once while an unpaid Invoice stays pending', async () => {
  const state = fixture();
  const orderResult = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);
  state.quickbooks.getInvoice = async () => paidEvidence(orderResult.orderHandle);

  const paid = await state.service.verifyOrderPayment({orderId:orderResult.orderHandle,source:'scheduled'});
  const duplicate = await state.service.verifyOrderPayment({orderId:orderResult.orderHandle,source:'webhook_hint'});

  assert.deepEqual(paid, {status:'fulfilled'});
  assert.deepEqual(duplicate, {status:'fulfilled'});
  assert.equal(state.repository.fulfillmentGrants.size, 1);

  const pendingState = fixture();
  const pendingOrder = await pendingState.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);
  const pending = await pendingState.service.verifyOrderPayment({orderId:pendingOrder.orderHandle,source:'scheduled'});
  assert.equal(pending.status, 'payment_verification_pending');
  assert.equal(pendingState.repository.fulfillmentGrants.size, 0);
});

test('payment verification survives a crash after every repository boundary without duplicate fulfillment', async () => {
  for (const crashMethod of ['getOrder','claimPaymentVerification','completeVerifiedDigitalOrder']) {
    let now = new Date('2026-08-29T18:00:00.000Z');
    const state = fixture({clock:() => now});
    const created = await state.service.createDigitalOrder({
      sku:catalogItem.sku,customerName:'Ada',idempotencyKey:`crash-${crashMethod}`,
    }, ownerAuth);
    state.quickbooks.getInvoice = async () => paidEvidence(created.orderHandle);
    crashOnceAfter(state.repository, crashMethod);

    await assert.rejects(
      state.service.verifyOrderPayment({orderId:created.orderHandle,source:'scheduled'}),
      {code:'SYNTHETIC_CRASH'},
      crashMethod
    );
    now = new Date('2026-08-29T18:05:00.000Z');
    await state.service.reconcilePendingOrders(now);
    await state.service.verifyOrderPayment({orderId:created.orderHandle,source:'scheduled'});

    assert.equal(state.repository.orders.get(created.orderHandle).status, 'fulfilled', crashMethod);
    assert.equal(state.repository.fulfillmentGrants.size, 1, crashMethod);
  }
});

test('reconciliation re-reads authoritative evidence and resumes every legacy payment intermediate state', async () => {
  for (const status of ['payment_verifying','paid','fulfilling']) {
    const state = fixture();
    const created = await state.service.createDigitalOrder({
      sku:catalogItem.sku,customerName:'Ada',idempotencyKey:`legacy-${status}`,
    }, ownerAuth);
    const order = state.repository.orders.get(created.orderHandle);
    order.status = status;
    order.activeTransition = {claimId:'abandoned',workerId:'old',transition:status};
    order.reconciliationDueAt = new Date('2026-08-29T18:00:00.000Z');
    state.quickbooks.getInvoice = async () => paidEvidence(created.orderHandle);

    await state.service.reconcilePendingOrders(new Date('2026-08-29T18:00:00.000Z'));

    assert.equal(order.status, 'fulfilled', status);
    assert.equal(state.repository.fulfillmentGrants.size, 1, status);
  }
});

test('a stored webhook hint prioritizes a future-due exact Invoice and is consumed after authoritative verification', async () => {
  const state = fixture();
  const created = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'hinted-order',
  }, ownerAuth);
  const order = state.repository.orders.get(created.orderHandle);
  order.reconciliationDueAt = new Date('2026-08-30T18:00:00.000Z');
  state.quickbooks.getInvoice = async () => paidEvidence(created.orderHandle);
  await state.repository.storeWebhookHints([{id:'a'.repeat(64),hint:{
    realmId:'realm-1',entityName:'Invoice',entityId:'invoice-1',operation:'Update',
    lastUpdated:'2026-08-29T18:00:00.000Z',
  }}]);

  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:01:00.000Z'));

  assert.equal(order.status, 'fulfilled');
  assert.equal(state.repository.fulfillmentGrants.size, 1);
  assert.equal(state.repository.webhookHints.size, 0);
});

test('retains a mapped webhook hint when authoritative processing crashes before completion', async () => {
  const state = fixture();
  const created = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'hint-crash-order',
  }, ownerAuth);
  state.repository.orders.get(created.orderHandle).reconciliationDueAt = new Date('2026-08-30T18:00:00.000Z');
  await state.repository.storeWebhookHints([{id:'c'.repeat(64),hint:{
    realmId:'realm-1',entityName:'Invoice',entityId:'invoice-1',operation:'Update',
    lastUpdated:'2026-08-29T18:00:00.000Z',
  }}]);
  state.repository.claimPaymentVerification = async () => {
    throw new Error('synthetic authoritative processing crash');
  };

  await assert.rejects(
    state.service.reconcilePendingOrders(new Date('2026-08-29T18:01:00.000Z')),
    /synthetic authoritative processing crash/
  );

  assert.equal(state.repository.webhookHints.size, 1);
});

test('retains a mapped hint while another worker owns payment verification, then resumes after its crash', async () => {
  let now = new Date('2026-08-29T18:00:00.000Z');
  const state = fixture({clock:() => now});
  const created = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'concurrent-hint-order',
  }, ownerAuth);
  const order = state.repository.orders.get(created.orderHandle);
  order.reconciliationDueAt = new Date('2026-08-30T18:00:00.000Z');
  let invoiceReads = 0;
  state.quickbooks.getInvoice = async () => {
    invoiceReads += 1;
    return paidEvidence(created.orderHandle);
  };
  await state.repository.storeWebhookHints([{id:'d'.repeat(64),hint:{
    realmId:'realm-1',entityName:'Invoice',entityId:'invoice-1',operation:'Update',
    lastUpdated:'2026-08-29T18:00:00.000Z',
  }}]);
  await state.repository.claimPaymentVerification(created.orderHandle, 'crashed-worker', now);

  const blocked = await state.service.reconcilePendingOrders(
    new Date('2026-08-29T18:01:00.000Z')
  );

  assert.equal(blocked.verifiedCount, 0);
  assert.equal(invoiceReads, 0);
  assert.equal(state.repository.webhookHints.size, 1);
  assert.equal(order.status, 'pending_payment');

  now = new Date('2026-08-29T18:05:00.000Z');
  const resumed = await state.service.reconcilePendingOrders(now);

  assert.equal(resumed.verifiedCount, 1);
  assert.equal(invoiceReads, 1);
  assert.equal(state.repository.webhookHints.size, 0);
  assert.equal(order.status, 'fulfilled');
  assert.equal(state.repository.fulfillmentGrants.size, 1);
});

test('retains a mapped hint when authoritative evidence is unavailable and a retry is scheduled', async () => {
  const state = fixture();
  const created = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'unavailable-hint-order',
  }, ownerAuth);
  const order = state.repository.orders.get(created.orderHandle);
  order.reconciliationDueAt = new Date('2026-08-30T18:00:00.000Z');
  state.quickbooks.getInvoice = async () => { throw new Error('synthetic Accounting outage'); };
  await state.repository.storeWebhookHints([{id:'e'.repeat(64),hint:{
    realmId:'realm-1',entityName:'Invoice',entityId:'invoice-1',operation:'Update',
    lastUpdated:'2026-08-29T18:00:00.000Z',
  }}]);

  const result = await state.service.reconcilePendingOrders(new Date('2026-08-29T18:01:00.000Z'));

  assert.equal(result.verifiedCount, 0);
  assert.equal(state.repository.webhookHints.size, 1);
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.lastErrorCode, 'payment_evidence_unavailable');
  assert.equal(order.reconciliationDueAt > new Date('2026-08-29T18:01:00.000Z'), true);
});

for (const [status,hintId] of [
  ['cancelled','6'.repeat(64)],
  ['refunded','7'.repeat(64)],
]) {
  test(`observes ${status} as terminal, consumes its hint, and preserves public status`, async () => {
    const state = fixture();
    const created = await state.service.createDigitalOrder({
      sku:catalogItem.sku,customerName:'Ada',idempotencyKey:`terminal-${status}`,
    }, ownerAuth);
    const order = state.repository.orders.get(created.orderHandle);
    Object.assign(order, {
      status,
      terminal:true,
      reconciliationDueAt:null,
    });
    let invoiceReads = 0;
    state.quickbooks.getInvoice = async () => {
      invoiceReads += 1;
      throw new Error('terminal orders must not read Accounting evidence');
    };
    await state.repository.storeWebhookHints([{id:hintId,hint:{
      realmId:'realm-1',entityName:'Invoice',entityId:'invoice-1',operation:'Update',
      lastUpdated:'2026-08-29T18:00:00.000Z',
    }}]);

    assert.deepEqual(
      await state.service.verifyOrderPayment({orderId:created.orderHandle,source:'admin'}),
      {status},
      status
    );
    const result = await state.service.reconcilePendingOrders(
      new Date('2026-08-29T18:01:00.000Z')
    );

    assert.equal(result.verifiedCount, 1, status);
    assert.equal(state.repository.webhookHints.size, 0, status);
    assert.equal(invoiceReads, 0, status);
    assert.equal(order.status, status, status);
  });
}

test('retains a Payment hint when its mapped invoices do not fit the remaining run budget', async () => {
  const repository = createMemoryRepository();
  const invoiceToOrder = new Map();
  const mappingLookups = [];
  for (let index = 0; index < 51; index += 1) {
    const orderId = `budget-order-${index}`;
    const invoiceId = `budget-invoice-${index}`;
    invoiceToOrder.set(invoiceId, orderId);
    repository.orders.set(orderId, {
      id:orderId,sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
      customerUid:'customer-uid',authorizedRecipientBinding:pilotBinding,status:'pending_payment',
      terminal:false,reconciliationDueAt:new Date('2026-08-30T18:00:00.000Z'),
      providerRefs:{
        realmId:'realm-1',invoiceId,customerId:'customer-1',providerOrderRef:`bk-order-${orderId}`,
      },
      fulfillment:{status:'locked'},
    });
    if (index < 49) {
      const hintId = String(index + 1).padStart(64, '0');
      repository.webhookHints.set(hintId, {
        hintId,realmId:'realm-1',entityName:'Invoice',entityId:invoiceId,operation:'Update',
        lastUpdated:`2026-08-29T18:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }
  }
  const paymentHintId = 'f'.repeat(64);
  repository.webhookHints.set(paymentHintId, {
    hintId:paymentHintId,realmId:'realm-1',entityName:'Payment',entityId:'budget-payment',
    operation:'Update',lastUpdated:'2026-08-29T18:00:59.000Z',
  });
  const findOrderByInvoiceId = repository.findOrderByInvoiceId.bind(repository);
  repository.findOrderByInvoiceId = async (realmId, invoiceId) => {
    mappingLookups.push(invoiceId);
    return findOrderByInvoiceId(realmId, invoiceId);
  };
  let invoiceReads = 0;
  let paymentReads = 0;
  const state = fixture({repository,quickbooks:{
    async getPayment() {
      paymentReads += 1;
      return {applications:[49,50].map(index => ({
        linkedTxnType:'Invoice',linkedTxnId:`budget-invoice-${index}`,
      }))};
    },
    async getInvoice(invoiceId) {
      invoiceReads += 1;
      const orderId = invoiceToOrder.get(invoiceId);
      return {
        realmId:'realm-1',invoice:{
          invoiceId,providerOrderRef:`bk-order-${orderId}`,totalAmountCents:4900,
          balanceCents:4900,currency:'USD',entityState:'present',paymentState:'unpaid',
        },payments:[],
      };
    },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  }});

  const result = await state.service.reconcilePendingOrders(new Date('2026-08-29T18:01:00.000Z'));

  assert.equal(result.verifiedCount, 50);
  assert.equal(invoiceReads, 50);
  assert.equal(paymentReads, 1);
  assert.equal(mappingLookups.length, 50);
  assert.equal(mappingLookups.includes('budget-invoice-50'), false);
  assert.deepEqual([...repository.webhookHints.keys()], [paymentHintId]);
});

test('stops hint provider work at capacity and leaves every later hint unprocessed', async () => {
  const repository = createMemoryRepository();
  const invoiceToOrder = new Map();
  for (let index = 0; index < 59; index += 1) {
    const orderId = `capacity-order-${index}`;
    const invoiceId = `capacity-invoice-${index}`;
    invoiceToOrder.set(invoiceId, orderId);
    repository.orders.set(orderId, {
      id:orderId,sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
      customerUid:'customer-uid',authorizedRecipientBinding:pilotBinding,status:'pending_payment',
      terminal:false,reconciliationDueAt:new Date('2026-08-30T18:00:00.000Z'),
      providerRefs:{
        realmId:'realm-1',invoiceId,customerId:'customer-1',providerOrderRef:`bk-order-${orderId}`,
      },
      fulfillment:{status:'locked'},
    });
  }
  const hintIds = [];
  const addHint = (position, hint) => {
    const hintId = String(position + 1).padStart(64, '0');
    hintIds.push(hintId);
    repository.webhookHints.set(hintId, {
      hintId,realmId:'realm-1',operation:'Update',
      lastUpdated:`2026-08-29T18:00:${String(position).padStart(2, '0')}.000Z`,
      ...hint,
    });
  };
  addHint(0, {entityName:'Payment',entityId:'capacity-payment-fill'});
  for (let position = 1; position <= 40; position += 1) {
    addHint(position, {entityName:'Invoice',entityId:`capacity-invoice-${position + 9}`});
  }
  addHint(41, {entityName:'Payment',entityId:'capacity-payment-trailing'});
  for (let position = 42; position < 50; position += 1) {
    addHint(position, {entityName:'Invoice',entityId:`capacity-invoice-${position + 9}`});
  }
  const mappingLookups = [];
  const findOrderByInvoiceId = repository.findOrderByInvoiceId.bind(repository);
  repository.findOrderByInvoiceId = async (realmId, invoiceId) => {
    mappingLookups.push(invoiceId);
    return findOrderByInvoiceId(realmId, invoiceId);
  };
  const paymentReads = [];
  let invoiceReads = 0;
  let cdcReads = 0;
  const state = fixture({repository,quickbooks:{
    async getPayment(paymentId) {
      paymentReads.push(paymentId);
      const indexes = paymentId === 'capacity-payment-fill'
        ? Array.from({length:10}, (_, index) => index)
        : [50];
      return {applications:indexes.map(index => ({
        linkedTxnType:'Invoice',linkedTxnId:`capacity-invoice-${index}`,
      }))};
    },
    async getInvoice(invoiceId) {
      invoiceReads += 1;
      const orderId = invoiceToOrder.get(invoiceId);
      return {
        realmId:'realm-1',invoice:{
          invoiceId,providerOrderRef:`bk-order-${orderId}`,totalAmountCents:4900,
          balanceCents:4900,currency:'USD',entityState:'present',paymentState:'unpaid',
        },payments:[],
      };
    },
    async getAccountingChanges() {
      cdcReads += 1;
      return {realmId:'realm-1',changes:[]};
    },
  }});

  const result = await state.service.reconcilePendingOrders(new Date('2026-08-29T18:01:00.000Z'));

  assert.equal(result.verifiedCount, 50);
  assert.equal(invoiceReads, 50);
  assert.deepEqual(paymentReads, ['capacity-payment-fill']);
  assert.equal(mappingLookups.length, 50);
  assert.equal(mappingLookups.includes('capacity-invoice-50'), false);
  assert.equal(cdcReads, 0);
  assert.deepEqual([...repository.webhookHints.keys()], hintIds.slice(41));
});

test('a Payment hint resolves only its bounded Invoice applications before exact Invoice verification', async () => {
  const repository = createMemoryRepository();
  const calls = {payments:[],invoices:[]};
  const quickbooks = {
    async createCommerceInvoice() { return {customerId:'customer-1',invoiceId:'invoice-1'}; },
    async sendInvoice(input) { return {invoiceId:input.invoiceId,sendAccepted:true}; },
    async getPayment(paymentId) {
      calls.payments.push(paymentId);
      return {
        applications:[
          {linkedTxnType:'Invoice',linkedTxnId:'invoice-1'},
          ...Array.from({length:15}, (_, index) => ({
            linkedTxnType:'Invoice',linkedTxnId:`unrelated-${index}`,
          })),
        ],
      };
    },
    async getInvoice(invoiceId) {
      calls.invoices.push(invoiceId);
      return paidEvidence('order-1');
    },
    async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
  };
  const state = fixture({repository,quickbooks});
  const created = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'payment-hint-order',
  }, ownerAuth);
  const order = repository.orders.get(created.orderHandle);
  order.reconciliationDueAt = new Date('2026-08-30T18:00:00.000Z');
  calls.invoices.length = 0;
  await repository.storeWebhookHints([{id:'b'.repeat(64),hint:{
    realmId:'realm-1',entityName:'Payment',entityId:'payment-1',operation:'Create',
    lastUpdated:'2026-08-29T18:00:00.000Z',
  }}]);

  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:01:00.000Z'));

  assert.deepEqual(calls.payments, ['payment-1']);
  assert.deepEqual(calls.invoices, ['invoice-1']);
  assert.equal(order.status, 'fulfilled');
  assert.equal(repository.fulfillmentGrants.size, 1);
  assert.equal(repository.webhookHints.size, 0);
});

test('CDC prioritizes a future-due stored Invoice but remains advisory-only', async () => {
  const repository = createMemoryRepository();
  const quickbooks = {
    async createCommerceInvoice() { return {customerId:'customer-1',invoiceId:'invoice-1'}; },
    async sendInvoice(input) { return {invoiceId:input.invoiceId,sendAccepted:true}; },
    async getInvoice() { return paidEvidence('order-1'); },
    async getAccountingChanges() {
      return {realmId:'realm-1',changes:[{entityType:'Invoice',entityId:'invoice-1',operation:'Update'}]};
    },
  };
  const state = fixture({repository,quickbooks});
  const created = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'cdc-order',
  }, ownerAuth);
  repository.orders.get(created.orderHandle).reconciliationDueAt = new Date('2026-08-30T18:00:00.000Z');

  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:01:00.000Z'));

  assert.equal(repository.orders.get(created.orderHandle).status, 'fulfilled');
  assert.equal(repository.fulfillmentGrants.size, 1);
});

test('invalid auth-mail configuration cannot block the Accounting payment lane', async () => {
  const repository = createMemoryRepository();
  await repository.createPilotAuthEmailEffect(pilotBinding);
  await repository.createReservedDigitalOrder({
    recipientBinding:pilotBinding,orderId:'order-1',order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',customer:{name:'Ada'},
      customerUid:'customer-uid',authorizedRecipientBinding:pilotBinding,status:'pending_payment',
      providerRefs:{
        realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-1',
      },
    },
  });
  repository.effects.get('order-1:invoice_create').status = 'completed';
  repository.effects.get('order-1:invoice_send').status = 'completed';
  Object.assign(repository.orders.get('order-1').providerRefs, {
    realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-1',
  });
  repository.orders.get('order-1').reconciliationDueAt = new Date('2026-08-29T18:00:00.000Z');
  const state = fixture({
    repository,
    getApprovedPilotEmail:() => { throw new Error('synthetic missing auth-mail configuration'); },
    quickbooks:{
      async getInvoice() { return paidEvidence('order-1'); },
      async getAccountingChanges() { return {realmId:'realm-1',changes:[]}; },
      async createCommerceInvoice() { throw new Error('must not create'); },
      async sendInvoice() { throw new Error('must not send'); },
    },
  });

  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:00:00.000Z'));

  assert.equal(repository.orders.get('order-1').status, 'fulfilled');
  assert.equal(repository.fulfillmentGrants.size, 1);
  assert.equal(state.calls.graph.length, 0);
});

test('a digital-disabled reconciliation never reads auth-mail configuration or constructs Graph work', async () => {
  const repository = createMemoryRepository();
  await repository.createPilotAuthEmailEffect(pilotBinding);
  let secretReads = 0;
  const state = fixture({
    repository,
    flags:{digitalInvoicePilotEnabled:false,serviceQboSendEnabled:false},
    getApprovedPilotEmail:() => { secretReads += 1; throw new Error('must stay lazy'); },
  });

  await state.service.reconcilePendingOrders(new Date('2026-08-29T18:00:00.000Z'));

  assert.equal(secretReads, 0);
  assert.equal(state.calls.graph.length, 0);
});

test('mismatched paid evidence moves the order to manual review without fulfillment', async () => {
  const state = fixture();
  const result = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);
  state.quickbooks.getInvoice = async () => ({
    ...paidEvidence(result.orderHandle),
    invoice:{...paidEvidence(result.orderHandle).invoice,totalAmountCents:9900},
  });

  const verified = await state.service.verifyOrderPayment({orderId:result.orderHandle,source:'scheduled'});

  assert.equal(verified.status, 'manual_review');
  assert.equal(state.repository.orders.get(result.orderHandle).status, 'manual_review');
  assert.equal(state.repository.fulfillmentGrants.size, 0);
  assert.deepEqual(state.calls.alerts, []);
});

test('status is owner-authorized and contains no email or accounting identifiers', async () => {
  const state = fixture();
  const result = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);
  const status = await state.service.getOrderStatus({orderHandle:result.orderHandle}, ownerAuth);
  assert.deepEqual(status, {
    orderHandle:result.orderHandle,status:'payment_verification_pending',
    message:'QuickBooks sent payment instructions to your email. Payment verification is pending.',
    downloadReady:false,
  });
  assert.equal(JSON.stringify(status).includes(pilotEmail), false);
  assert.equal(JSON.stringify(status).includes('invoice-1'), false);
  await assert.rejects(
    state.service.getOrderStatus({orderHandle:result.orderHandle}, {...ownerAuth,uid:'other'}),
    {code:'ORDER_NOT_FOUND'}
  );
  await assert.rejects(
    state.service.getOrderStatus({orderHandle:`${result.orderHandle}x`}, ownerAuth),
    {code:'ORDER_NOT_FOUND'}
  );
});

test('buyer catalog capability requires App Check and stays inactive until every release gate is active', async () => {
  const state = fixture();
  await assert.rejects(state.service.getBuyerCommerceCapability({}), {code:'APP_CHECK_REQUIRED'});
  assert.deepEqual(await state.service.getBuyerCommerceCapability(appCheck), {
    products:[{sku:'home-inspection-study-guide',active:false}],
  });
  assert.deepEqual(Object.keys((await state.service.getBuyerCommerceCapability(appCheck)).products[0]), ['sku','active']);
});

test('owner status projects every internal state to the strict buyer allowlist', async () => {
  const state = fixture();
  const result = await state.service.createDigitalOrder({sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'status-map'}, ownerAuth);
  const order = state.repository.orders.get(result.orderHandle);
  const cases = [
    ['invoice_processing','invoice_send_pending',false],
    ['invoiced','payment_verification_pending',false],
    ['paid','paid',false],
    ['fulfilling','paid',false],
    ['fulfilled','fulfilled',true],
    ['cancelled','cancelled',false],
    ['refunded','cancelled',false],
    ['manual_review','manual_support',false],
  ];
  for (const [internal,publicStatus,downloadReady] of cases) {
    order.status=internal;
    const status=await state.service.getOrderStatus({orderHandle:result.orderHandle},ownerAuth);
    assert.equal(status.status,publicStatus);
    assert.equal(status.downloadReady,downloadReady);
    assert.deepEqual(Object.keys(status),['orderHandle','status','message','downloadReady']);
  }
  order.status='paid';order.lastErrorCode='delivery_failed';
  assert.equal((await state.service.getOrderStatus({orderHandle:result.orderHandle},ownerAuth)).status,'fulfillment_delayed');
});

test('status abuse control receives only a separate fixed-length digest, never the UID', async () => {
  const seen = [];
  const state = fixture({statusRequestLimiter:async key => { seen.push(key); return true; }});
  const result = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);

  await state.service.getOrderStatus({orderHandle:result.orderHandle}, ownerAuth);

  assert.equal(seen.length, 1);
  assert.match(seen[0], /^[a-f0-9]{64}$/);
  assert.notEqual(seen[0], ownerAuth.uid);
});

test('status throttling happens from verified token identity before any Admin user lookup', async () => {
  let adminLookups = 0;
  const state = fixture({
    statusRequestLimiter:async () => false,
    getCurrentUser:async () => { adminLookups += 1; throw new Error('must not run'); },
  });

  await assert.rejects(
    state.service.getOrderStatus({orderHandle:'order-1'}, ownerAuth),
    {code:'RATE_LIMITED'}
  );
  assert.equal(adminLookups, 0);
});

test('null status input returns the intended safe not-found error', async () => {
  const state = fixture();

  await assert.rejects(state.service.getOrderStatus(null, ownerAuth), {code:'ORDER_NOT_FOUND'});
});

test('release state requires App Check and an administrator and exposes only two Booleans', async () => {
  const state = fixture();
  await assert.rejects(state.service.getCommerceReleaseState({uid:'admin',admin:true}), {code:'APP_CHECK_REQUIRED'});
  await assert.rejects(state.service.getCommerceReleaseState({uid:'user',app:{},admin:false}), {code:'ADMIN_REQUIRED'});
  assert.deepEqual(await state.service.getCommerceReleaseState({uid:'admin',app:{},admin:true}), {
    digitalInvoicePilotEnabled:true,
    serviceQboSendEnabled:false,
  });
});

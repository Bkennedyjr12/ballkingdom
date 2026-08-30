import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommerceService} from '../../src/commerce/commerce-service.js';

const pilotEmail = 'approved-pilot@example.test';
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
  const disabledAudits = [];
  let claimSequence = 0;

  function orderEffect(orderId, effect) {
    return effects.get(`${orderId}:${effect}`);
  }

  return {
    orders,
    effects,
    authEffects,
    disabledAudits,
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
    async recoverExpiredEffects(now) {
      const result = {
        recoveredCreateOrderIds:[],recoveredPilotAuthBindings:[],
        manualReviewOrderIds:[],manualReviewPilotAuthBindings:[],
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
  let idSequence = 0;
  const service = createCommerceService({
    repository,
    quickbooks,
    graph,
    auth,
    getCommerceItem: overrides.getCommerceItem ?? (() => catalogItem),
    readFeatureFlags: () => flags,
    getApprovedPilotEmail: () => pilotEmail,
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

const ownerAuth = Object.freeze({uid:'customer-uid',email:pilotEmail,emailVerified:true});
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
  assert.deepEqual(state.calls.alerts, [{code:'pilot_auth_email_unknown'}]);
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
    {code:'PILOT_RECIPIENT_REQUIRED'}
  );

  const result = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
    amountCents:1,uid:'attacker',email:'attacker@example.test',
  }, ownerAuth);

  assert.equal(result.amountCents, catalogItem.amountCents);
  assert.equal(state.calls.create[0].amountCents, catalogItem.amountCents);
  const order = state.repository.orders.get(result.orderHandle);
  assert.equal(order.customerUid, ownerAuth.uid);
  assert.equal(order.customer.email, pilotEmail);
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
    recipientBinding:'binding',
    orderId:'order-1',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',
      customer:{name:'Ada',email:pilotEmail},customerUid:'customer-uid',status:'pending_payment',
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
    recipientBinding:'binding',orderId:'order-1',
    order:{
      sku:catalogItem.sku,name:catalogItem.name,amountCents:4900,currency:'USD',
      orderType:'digital_product',fulfillmentType:'protected_download',
      customer:{name:'Ada',email:pilotEmail},customerUid:'customer-uid',status:'pending_payment',
    },
  });
  Object.assign(repository.orders.get('order-1').providerRefs, {
    realmId:'realm-1',invoiceId:'invoice-1',customerId:'customer-1',providerOrderRef:'bk-order-order-1',
  });
  repository.effects.get('order-1:invoice_create').status = 'completed';
  await repository.claimEffect('order-1','invoice_send','stale-worker',now);
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
  assert.deepEqual(state.calls.alerts, [{code:'invoice_send_unknown',orderId:'order-1'}]);
});

test('authoritative exact payment evidence fulfills once while an unpaid Invoice stays pending', async () => {
  const state = fixture();
  const orderResult = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);
  state.quickbooks.getInvoice = async () => paidEvidence(orderResult.orderHandle);

  const paid = await state.service.verifyOrderPayment({orderId:orderResult.orderHandle,source:'scheduled'});
  const duplicate = await state.service.verifyOrderPayment({orderId:orderResult.orderHandle,source:'webhook_hint'});

  assert.equal(paid.status, 'fulfilled');
  assert.equal(duplicate.status, 'fulfilled');
  assert.deepEqual(state.calls.fulfill, [orderResult.orderHandle]);

  const pendingState = fixture();
  const pendingOrder = await pendingState.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);
  const pending = await pendingState.service.verifyOrderPayment({orderId:pendingOrder.orderHandle,source:'scheduled'});
  assert.equal(pending.status, 'payment_verification_pending');
  assert.equal(pendingState.calls.fulfill.length, 0);
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
  assert.equal(state.calls.fulfill.length, 0);
});

test('status is owner-authorized and contains no email or accounting identifiers', async () => {
  const state = fixture();
  const result = await state.service.createDigitalOrder({
    sku:catalogItem.sku,customerName:'Ada',idempotencyKey:'order-1',
  }, ownerAuth);
  const status = await state.service.getOrderStatus({orderHandle:result.orderHandle}, ownerAuth);
  assert.deepEqual(status, {
    orderHandle:result.orderHandle,amountCents:4900,currency:'USD',status:'payment_verification_pending',
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

test('release state requires App Check and an administrator and exposes only two Booleans', async () => {
  const state = fixture();
  await assert.rejects(state.service.getCommerceReleaseState({uid:'admin',admin:true}), {code:'APP_CHECK_REQUIRED'});
  await assert.rejects(state.service.getCommerceReleaseState({uid:'user',app:{},admin:false}), {code:'ADMIN_REQUIRED'});
  assert.deepEqual(await state.service.getCommerceReleaseState({uid:'admin',app:{},admin:true}), {
    digitalInvoicePilotEnabled:true,
    serviceQboSendEnabled:false,
  });
});

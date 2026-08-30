import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCommerceService} from '../../src/commerce/commerce-service.js';
import {createRefundControlRepository} from '../../src/index.js';

const paidOrder = Object.freeze({
  id:'order-1', status:'fulfilled', amountCents:4900, currency:'USD', refundedAmountCents:0,
  providerRefs:{realmId:'realm-1',invoiceId:'invoice-1',providerOrderRef:'bk-order-order-1'},
});

function paidEvidence(overrides = {}) {
  return {
    realmId:'realm-1',
    invoice:{
      invoiceId:'invoice-1',providerOrderRef:'bk-order-order-1',totalAmountCents:4900,
      balanceCents:0,currency:'USD',entityState:'present',paymentState:'paid',
    },
    payments:[{
      providerPaymentRef:'payment-1',totalAmountCents:4900,unappliedAmountCents:0,
      entityState:'present',applications:[{linkedTxnId:'invoice-1',linkedTxnType:'Invoice',amountCents:4900}],
    }],
    ...overrides,
  };
}

function exactRefundEvidence(overrides = {}) {
  return {
    capability:'documented_accounting_refund_v1',
    realmId:'realm-1',
    invoiceId:'invoice-1',
    providerOrderRef:'bk-order-order-1',
    providerPaymentRef:'payment-1',
    currency:'USD',
    refunds:[{
      refundId:'refund-1',entityState:'present',status:'completed',amountCents:4900,
      invoiceId:'invoice-1',providerOrderRef:'bk-order-order-1',providerPaymentRef:'payment-1',currency:'USD',
    }],
    ...overrides,
  };
}

function fixture({
  order = paidOrder,
  refundEvidence = exactRefundEvidence({refunds:[]}),
  refundCapability = true,
  beforeReviewTransaction = async () => {},
  beforeRefundTransaction = async () => {},
  retryReviewTransaction = false,
} = {}) {
  const stored = structuredClone(order);
  const reviews = new Map();
  const audits = [];
  const calls = {getInvoice:0,getRefundEvidence:0,providerRefund:0,reviewTransactionAttempts:0};
  const repository = {
    async getOrder(id) { return id === stored.id ? stored : null; },
    async recordRefundReview(input) {
      await beforeReviewTransaction(stored);
      const existing = reviews.get(input.idempotencyKey);
      if (existing) return {...existing,duplicate:true};
      const validateTransactionRead = () => {
        calls.reviewTransactionAttempts += 1;
        const binding = createHash('sha256').update(
          `refund-order-binding\0${stored.providerRefs.realmId}\0${stored.providerRefs.invoiceId}\0${stored.providerRefs.providerOrderRef}`
        ).digest('hex');
        if (!['paid','fulfilled'].includes(stored.status)
          || stored.amountCents !== input.authoritativeTotalAmountCents
          || Number(stored.refundedAmountCents ?? 0) !== input.authoritativeRefundedAmountCents
          || binding !== input.orderBinding) {
          const error = new Error('refund state conflict'); error.code = 'REFUND_STATE_CONFLICT'; throw error;
        }
      };
      validateTransactionRead();
      if (retryReviewTransaction) validateTransactionRead();
      const pending = [...reviews.values()].reduce((sum, review) => sum + review.amountCents, 0);
      const unrefunded = stored.amountCents - Number(stored.refundedAmountCents ?? 0);
      if (pending + input.amountCents > unrefunded) {
        const error = new Error('excessive refund review'); error.code = 'REFUND_AMOUNT_INVALID'; throw error;
      }
      const review = {reviewId:`review-${reviews.size + 1}`,orderId:input.orderId,amountCents:input.amountCents,status:'pending_operator_action'};
      reviews.set(input.idempotencyKey, review);
      audits.push({event:'refund_review_requested',orderId:input.orderId,amountCents:input.amountCents,adminUid:input.adminUid});
      return {...review,duplicate:false};
    },
    async recordRefundManualReview(input) {
      stored.lastErrorCode = input.errorCode;
      audits.push({event:'refund_manual_review',orderId:input.orderId,errorCode:input.errorCode,adminUid:input.adminUid});
    },
    async completeRefundReconciliation(input) {
      await beforeRefundTransaction(stored);
      if (stored.status === 'refunded' && stored.refundEvidenceId === input.evidenceId) {
        return {completed:true,duplicate:true,status:'refunded'};
      }
      if (stored.status !== input.expectedStatus
        || Number(stored.refundedAmountCents ?? 0) !== input.expectedRefundedAmountCents) {
        audits.push({event:'refund_manual_review',orderId:input.orderId,errorCode:'refund_state_conflict',adminUid:input.adminUid});
        return {completed:false,duplicate:false,status:stored.status,errorCode:'refund_state_conflict'};
      }
      stored.refundedAmountCents = input.cumulativeRefundedAmountCents;
      stored.refundEvidenceId = input.evidenceId;
      if (input.cumulativeRefundedAmountCents === stored.amountCents) {
        stored.status = 'refunded'; stored.lastReconciledRefundAmountCents = input.amountCents;
      }
      audits.push({
        event:stored.status === 'refunded' ? 'refund_reconciled' : 'refund_manual_review',
        orderId:input.orderId,amountCents:input.amountCents,adminUid:input.adminUid,
      });
      return {completed:stored.status === 'refunded',duplicate:false,status:stored.status};
    },
  };
  const quickbooks = {
    refundEvidenceCapability:refundCapability,
    async getInvoice() { calls.getInvoice += 1; return paidEvidence(); },
    async getRefundEvidence() { calls.getRefundEvidence += 1; return structuredClone(refundEvidence); },
    async refund() { calls.providerRefund += 1; throw new Error('must never be called'); },
  };
  const service = createCommerceService({
    repository, quickbooks, getApprovedPilotEmail:()=>'pilot@example.invalid',
    readFeatureFlags:()=>({digitalInvoicePilotEnabled:false,serviceQboSendEnabled:false}),
  });
  return {service,stored,reviews,audits,calls};
}

const admin = Object.freeze({uid:'admin-1',token:{admin:true},app:{appId:'test-app'}});

function transactionDatabase(seed = {}, {retryOnce = false} = {}) {
  const documents = new Map(Object.entries(seed).map(([path,value]) => [path,structuredClone(value)]));
  let transactionAttempts = 0;
  let queue = Promise.resolve();
  let autoId = 0;
  const collection = name => {
    const buildQuery = (filters = [],maximum = Infinity) => {
      const query = {
      doc(id) {
        const documentId = id ?? `auto-${++autoId}`;
        return {path:`${name}/${documentId}`,id:documentId};
      },
      where(field,operator,value) {
        assert.equal(operator,'==');
        return buildQuery([...filters,[field,value]],maximum);
      },
      limit(value) { return buildQuery(filters,value); },
      async get() {
        const docs = [...documents]
          .filter(([path,data]) => path.startsWith(`${name}/`)
            && filters.every(([field,value]) => data[field] === value))
          .slice(0,maximum)
          .map(([path,data]) => ({id:path.slice(name.length+1),ref:{path,id:path.slice(name.length+1)},data:()=>structuredClone(data)}));
        return {docs,size:docs.length,empty:docs.length===0};
      },
      };
      query._isQuery=true;
      return query;
    };
    return buildQuery();
  };
  const execute = async callback => {
    transactionAttempts += 1;
    const writes = [];
    const transaction = {
      async get(reference) {
        if (reference?._isQuery) return reference.get();
        const value = documents.get(reference.path);
        return {exists:value !== undefined,data:()=>value === undefined ? undefined : structuredClone(value)};
      },
      create(reference,value) { writes.push(['create',reference.path,structuredClone(value)]); },
      set(reference,value) { writes.push(['set',reference.path,structuredClone(value)]); },
      update(reference,value) { writes.push(['update',reference.path,structuredClone(value)]); },
    };
    const result = await callback(transaction);
    for (const [operation,path,value] of writes) {
      if (operation === 'create' && documents.has(path)) throw new Error('already exists');
      documents.set(path,operation === 'update' ? {...documents.get(path),...value} : value);
    }
    return result;
  };
  return {
    documents,
    collection,
    get transactionAttempts() { return transactionAttempts; },
    runTransaction(callback) {
      const run = async () => {
        if (retryOnce) {
          retryOnce = false;
          transactionAttempts += 1;
          const noCommit = {get:async reference => {
            if (reference?._isQuery) return reference.get();
            const value = documents.get(reference.path);
            return {exists:value !== undefined,data:()=>structuredClone(value)};
          },create(){},set(){},update(){}};
          await callback(noCommit);
        }
        return execute(callback);
      };
      const pending = queue.then(run,run);
      queue = pending.catch(()=>{});
      return pending;
    },
  };
}

const serverTimestamp = Object.freeze({serverTimestamp:()=>'<server-time>'});
const orderBinding = createHash('sha256').update(
  'refund-order-binding\0realm-1\0invoice-1\0bk-order-order-1'
).digest('hex');
const reviewId = (orderId,amountCents) => createHash('sha256')
  .update(`refund-review\0${orderId}\0${amountCents}`).digest('hex');

test('refund controls require authentication, admin claim, and App Check', async () => {
  for (const context of [
    {app:{appId:'test-app'}},
    {uid:'user-1',token:{admin:false},app:{appId:'test-app'}},
    {uid:'admin-1',token:{admin:true}},
  ]) {
    const {service} = fixture();
    await assert.rejects(
      service.requestRefundReview({orderId:'order-1',amountCents:4900,reason:'Duplicate purchase'}, context),
      error => ['AUTH_REQUIRED','ADMIN_REQUIRED','APP_CHECK_REQUIRED'].includes(error.code),
    );
  }
});

test('refund review validates bounded reason and integer amount against exact paid evidence', async () => {
  for (const input of [
    {orderId:'order-1',amountCents:0,reason:'Valid reason'},
    {orderId:'order-1',amountCents:4900.5,reason:'Valid reason'},
    {orderId:'order-1',amountCents:4901,reason:'Valid reason'},
    {orderId:'order-1',amountCents:100,reason:''},
    {orderId:'order-1',amountCents:100,reason:'x'.repeat(501)},
  ]) {
    const {service} = fixture();
    await assert.rejects(service.requestRefundReview(input, admin), /invalid/i);
  }
});

test('refund review is stable-idempotent and records an internal work item without provider mutation', async () => {
  const {service,reviews,calls,stored} = fixture();
  const input = {orderId:'order-1',amountCents:4900,reason:'Duplicate purchase'};
  const first = await service.requestRefundReview(input, admin);
  const second = await service.requestRefundReview(input, admin);
  assert.deepEqual(first, {status:'pending_operator_action',duplicate:false,reviewHandle:first.reviewHandle});
  assert.deepEqual(second, {status:'pending_operator_action',duplicate:true,reviewHandle:first.reviewHandle});
  assert.equal(reviews.size, 1);
  assert.equal(calls.providerRefund, 0);
  assert.equal(stored.status, 'fulfilled');
});

test('refund review is unavailable before any repository write when the documented reader is absent', async () => {
  const {service,reviews,calls} = fixture({refundCapability:false});
  await assert.rejects(
    service.requestRefundReview({orderId:'order-1',amountCents:4900,reason:'Duplicate purchase'}, admin),
    error => error.code === 'REFUND_EVIDENCE_UNAVAILABLE',
  );
  assert.equal(reviews.size, 0);
  assert.equal(calls.getInvoice, 0);
  assert.equal(calls.getRefundEvidence, 0);
  assert.equal(calls.providerRefund, 0);
});

test('business idempotency suppresses duplicate reviews across administrators and reasons', async () => {
  const {service,reviews} = fixture();
  const first = await service.requestRefundReview({orderId:'order-1',amountCents:1000,reason:'First reason'}, admin);
  const second = await service.requestRefundReview(
    {orderId:'order-1',amountCents:1000,reason:'Changed reason'},
    {uid:'admin-2',token:{admin:true},app:{appId:'test-app'}},
  );
  assert.equal(reviews.size, 1);
  assert.equal(second.reviewHandle, first.reviewHandle);
  assert.equal(second.duplicate, true);
});

test('review transaction re-reads the order and loses safely to a concurrent refund reconciliation', async () => {
  const state = fixture({beforeReviewTransaction:async order => {
    order.status = 'refunded'; order.refundedAmountCents = order.amountCents;
  }});
  await assert.rejects(
    state.service.requestRefundReview({orderId:'order-1',amountCents:1000,reason:'Race test'}, admin),
    error => error.code === 'REFUND_STATE_CONFLICT',
  );
  assert.equal(state.reviews.size, 0);
});

test('review transaction rejects a changed immutable Accounting binding', async () => {
  const state = fixture({beforeReviewTransaction:async order => {
    order.providerRefs.providerOrderRef = 'bk-order-other';
  }});
  await assert.rejects(
    state.service.requestRefundReview({orderId:'order-1',amountCents:1000,reason:'Binding race'}, admin),
    error => error.code === 'REFUND_STATE_CONFLICT',
  );
  assert.equal(state.reviews.size, 0);
});

test('transaction retry creates one review and one audit-equivalent work item', async () => {
  const state = fixture({retryReviewTransaction:true});
  await state.service.requestRefundReview({orderId:'order-1',amountCents:1000,reason:'Retry test'}, admin);
  assert.equal(state.calls.reviewTransactionAttempts, 2);
  assert.equal(state.reviews.size, 1);
  assert.equal(state.audits.filter(entry => entry.event === 'refund_review_requested').length, 1);
});

test('multiple reviews cannot exceed the verified unrefunded amount', async () => {
  const {service} = fixture();
  await service.requestRefundReview({orderId:'order-1',amountCents:3000,reason:'Partial adjustment one'}, admin);
  await assert.rejects(
    service.requestRefundReview({orderId:'order-1',amountCents:2000,reason:'Partial adjustment two'}, admin),
    error => error.code === 'REFUND_AMOUNT_INVALID',
  );
});

test('reconcileOrder reuses the exact existing payment evidence verifier', async () => {
  const {service,calls} = fixture({order:{...paidOrder,status:'paid'}});
  const result = await service.reconcileOrder({orderId:'order-1'}, admin);
  assert.deepEqual(result, {orderHandle:'order-1',status:'paid',evidence:'exact_accounting_payment'});
  assert.equal(calls.getInvoice, 1);
});

test('refund reconciliation preserves paid or fulfilled state without exact current evidence', async () => {
  for (const originalStatus of ['paid','fulfilled']) {
    const {service,stored,audits} = fixture({
      order:{...paidOrder,status:originalStatus},
      refundEvidence:exactRefundEvidence({realmId:'wrong-realm'}),
    });
    const result = await service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin);
    assert.deepEqual(result, {orderHandle:'order-1',status:originalStatus,reconciliation:'manual_review'});
    assert.equal(stored.status, originalStatus);
    assert.equal(audits.at(-1).event, 'refund_manual_review');
  }
});

test('refund reconciliation transitions only on exact current Accounting evidence', async () => {
  const {service,stored,calls,audits} = fixture({refundEvidence:exactRefundEvidence()});
  const result = await service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin);
  assert.deepEqual(result, {orderHandle:'order-1',status:'refunded',reconciliation:'exact_accounting_refund'});
  assert.equal(stored.status, 'refunded');
  assert.equal(calls.getInvoice, 1);
  assert.equal(calls.getRefundEvidence, 1);
  assert.equal(calls.providerRefund, 0);
  assert.deepEqual(Object.keys(result).sort(), ['orderHandle','reconciliation','status']);
  assert.deepEqual(Object.keys(audits.at(-1)).sort(), ['adminUid','amountCents','event','orderId']);
});

test('refund evidence must match current payment, invoice, order, currency, realm, and amount exactly', async () => {
  const mutations = [
    evidence => { evidence.invoiceId = 'invoice-2'; },
    evidence => { evidence.providerOrderRef = 'bk-order-other'; },
    evidence => { evidence.providerPaymentRef = 'payment-2'; },
    evidence => { evidence.currency = 'CAD'; },
    evidence => { evidence.refunds[0].amountCents = 4899; },
    evidence => { evidence.refunds[0].status = 'pending'; },
    evidence => { evidence.refunds[0].entityState = 'deleted'; },
  ];
  for (const mutate of mutations) {
    const evidence = exactRefundEvidence(); mutate(evidence);
    const {service,stored} = fixture({refundEvidence:evidence});
    const result = await service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin);
    assert.equal(result.reconciliation, 'manual_review');
    assert.equal(stored.status, 'fulfilled');
  }
});

test('an exact partial refund remains nonterminal and records manual review with cumulative cents', async () => {
  const evidence = exactRefundEvidence();
  evidence.refunds[0].amountCents = 1000;
  const {service,stored,audits} = fixture({refundEvidence:evidence});
  const result = await service.reconcileRefund({orderId:'order-1',amountCents:1000}, admin);
  assert.equal(result.status, 'fulfilled');
  assert.equal(result.reconciliation, 'manual_review');
  assert.equal(stored.refundedAmountCents, 1000);
  assert.equal(audits.at(-1).event, 'refund_manual_review');
});

test('concurrent identical refund reconciliation is idempotent', async () => {
  const state = fixture({refundEvidence:exactRefundEvidence()});
  const results = await Promise.all([
    state.service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin),
    state.service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin),
  ]);
  assert.equal(state.stored.status, 'refunded');
  assert.ok(results.every(result => result.status === 'refunded'));
});

test('a completed identical refund reconciliation retry returns the same terminal result', async () => {
  const state = fixture({refundEvidence:exactRefundEvidence()});
  const first = await state.service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin);
  const second = await state.service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin);
  assert.deepEqual(second, first);
  assert.equal(state.stored.status, 'refunded');
});

test('repository state conflict becomes redacted manual review without changing paid state', async () => {
  let changed = false;
  const state = fixture({refundEvidence:exactRefundEvidence(),beforeRefundTransaction:async order => {
    if (!changed) { changed = true; order.status = 'paid'; }
  }});
  const result = await state.service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin);
  assert.deepEqual(result, {orderHandle:'order-1',status:'paid',reconciliation:'manual_review'});
  assert.equal(state.stored.status, 'paid');
  assert.equal(state.audits.at(-1).errorCode, 'refund_state_conflict');
});

test('admin results and audit receipts expose no customer, provider URL, or secret data', async () => {
  const {service,audits} = fixture();
  const result = await service.requestRefundReview({orderId:'order-1',amountCents:4900,reason:'Customer email exposed?'}, admin);
  const serialized = JSON.stringify({result,audits});
  assert.doesNotMatch(serialized, /@|https?:|realm-1|invoice-1|payment-1|customer|secret/i);
  assert.match(result.reviewHandle, /^[a-f0-9]{64}$/);
});

test('stateful refund repository retries transaction without duplicating review or audit', async () => {
  const database = transactionDatabase({'orders/order-1':structuredClone(paidOrder)},{retryOnce:true});
  const repository = createRefundControlRepository({db:database,fieldValue:serverTimestamp});
  const result = await repository.recordRefundReview({
    orderId:'order-1',amountCents:1000,reason:'Stateful retry',adminUid:'admin-1',
    authoritativeTotalAmountCents:4900,authoritativeRefundedAmountCents:0,
    orderBinding,idempotencyKey:'a'.repeat(64),
  });
  assert.equal(result.duplicate,false);
  assert.equal(database.transactionAttempts,2);
  assert.equal([...database.documents].filter(([path])=>path.startsWith('commerceRefundReviews/')).length,1);
  assert.equal([...database.documents].filter(([path])=>path.startsWith('commerceAudit/')).length,1);
});

test('stateful refund repository rejects review after authoritative order becomes refunded', async () => {
  const database = transactionDatabase({'orders/order-1':{...structuredClone(paidOrder),status:'refunded',refundedAmountCents:4900}});
  const repository = createRefundControlRepository({db:database,fieldValue:serverTimestamp});
  await assert.rejects(repository.recordRefundReview({
    orderId:'order-1',amountCents:1000,reason:'Losing race',adminUid:'admin-1',
    authoritativeTotalAmountCents:4900,authoritativeRefundedAmountCents:0,
    orderBinding,idempotencyKey:'b'.repeat(64),
  }), error => error.code === 'REFUND_STATE_CONFLICT');
  assert.equal([...database.documents].some(([path])=>path.startsWith('commerceRefundReviews/')),false);
});

test('stateful refund repository rejects a stale idempotent review after order state or binding changes', async () => {
  for (const mutate of [
    order => { order.providerRefs.providerOrderRef='bk-order-changed'; },
    order => { order.status='refunded'; order.refundedAmountCents=4900; },
  ]) {
    const database = transactionDatabase({'orders/order-1':structuredClone(paidOrder)});
    const repository = createRefundControlRepository({db:database,fieldValue:serverTimestamp});
    const input = {
      orderId:'order-1',amountCents:1000,reason:'Original',adminUid:'admin-1',
      authoritativeTotalAmountCents:4900,authoritativeRefundedAmountCents:0,
      orderBinding,idempotencyKey:reviewId('order-1',1000),
    };
    await repository.recordRefundReview(input);
    mutate(database.documents.get('orders/order-1'));
    await assert.rejects(
      repository.recordRefundReview({...input,reason:'Changed',adminUid:'admin-2'}),
      error => error.code === 'REFUND_STATE_CONFLICT',
    );
    assert.equal(database.documents.get(`commerceRefundReviews/${input.idempotencyKey}`).status,'pending_operator_action');
  }
});

test('stateful refund repository serializes identical reconciliation and preserves partial status', async () => {
  const database = transactionDatabase({'orders/order-1':structuredClone(paidOrder)});
  const repository = createRefundControlRepository({db:database,fieldValue:serverTimestamp});
  await repository.recordRefundReview({
    orderId:'order-1',amountCents:1000,reason:'First partial',adminUid:'admin-1',
    authoritativeTotalAmountCents:4900,authoritativeRefundedAmountCents:0,
    orderBinding,idempotencyKey:reviewId('order-1',1000),
  });
  const partial = await repository.completeRefundReconciliation({
    orderId:'order-1',amountCents:1000,adminUid:'admin-1',evidenceId:'c'.repeat(64),orderBinding,
    expectedStatus:'fulfilled',expectedRefundedAmountCents:0,cumulativeRefundedAmountCents:1000,
    reviewId:reviewId('order-1',1000),
  });
  assert.equal(partial.completed,false);
  assert.equal(database.documents.get('orders/order-1').status,'fulfilled');
  assert.equal(database.documents.get('orders/order-1').refundedAmountCents,1000);

  await repository.recordRefundReview({
    orderId:'order-1',amountCents:3900,reason:'Remaining amount',adminUid:'admin-1',
    authoritativeTotalAmountCents:4900,authoritativeRefundedAmountCents:1000,
    orderBinding,idempotencyKey:reviewId('order-1',3900),
  });
  const input = {
    orderId:'order-1',amountCents:3900,adminUid:'admin-1',evidenceId:'d'.repeat(64),orderBinding,
    expectedStatus:'fulfilled',expectedRefundedAmountCents:1000,cumulativeRefundedAmountCents:4900,
    reviewId:reviewId('order-1',3900),
  };
  const results = await Promise.all([
    repository.completeRefundReconciliation(input),repository.completeRefundReconciliation(input),
  ]);
  assert.equal(database.documents.get('orders/order-1').status,'refunded');
  assert.equal(results.filter(result=>result.duplicate).length,1);
});

test('partial reconciliation resolves one review and releases pending cents exactly once', async () => {
  const database = transactionDatabase({'orders/order-1':structuredClone(paidOrder)});
  const repository = createRefundControlRepository({db:database,fieldValue:serverTimestamp});
  const firstReview = {
    orderId:'order-1',amountCents:1000,reason:'Approved partial',adminUid:'admin-1',
    authoritativeTotalAmountCents:4900,authoritativeRefundedAmountCents:0,
    orderBinding,idempotencyKey:reviewId('order-1',1000),
  };
  await repository.recordRefundReview(firstReview);
  const reconciliation = {
    orderId:'order-1',amountCents:1000,adminUid:'admin-1',evidenceId:'e'.repeat(64),orderBinding,
    expectedStatus:'fulfilled',expectedRefundedAmountCents:0,cumulativeRefundedAmountCents:1000,
    reviewId:firstReview.idempotencyKey,
  };
  const first = await repository.completeRefundReconciliation(reconciliation);
  const duplicate = await repository.completeRefundReconciliation(reconciliation);
  assert.equal(first.completed,false);
  assert.equal(duplicate.duplicate,true);
  assert.equal(database.documents.get(`commerceRefundReviews/${firstReview.idempotencyKey}`).status,'resolved');
  assert.equal(database.documents.get('commerceRefundReviewTotals/order-1').pendingAmountCents,0);

  await repository.recordRefundReview({
    orderId:'order-1',amountCents:3900,reason:'Remaining refund',adminUid:'admin-1',
    authoritativeTotalAmountCents:4900,authoritativeRefundedAmountCents:1000,
    orderBinding,idempotencyKey:reviewId('order-1',3900),
  });
  assert.equal(database.documents.get('commerceRefundReviewTotals/order-1').pendingAmountCents,3900);
});

test('multiple legacy pending matches preserve state and create manual review', async () => {
  const database = transactionDatabase({
    'orders/order-1':structuredClone(paidOrder),
    'commerceRefundReviews/legacy-a':{orderId:'order-1',amountCents:1000,status:'pending_operator_action'},
    'commerceRefundReviews/legacy-b':{orderId:'order-1',amountCents:1000,status:'pending_operator_action'},
    'commerceRefundReviewTotals/order-1':{orderId:'order-1',pendingAmountCents:2000},
  });
  const repository = createRefundControlRepository({db:database,fieldValue:serverTimestamp});
  const result = await repository.completeRefundReconciliation({
    orderId:'order-1',amountCents:1000,adminUid:'admin-1',evidenceId:'f'.repeat(64),orderBinding,
    expectedStatus:'fulfilled',expectedRefundedAmountCents:0,cumulativeRefundedAmountCents:1000,
    reviewId:reviewId('order-1',1000),
  });
  assert.equal(result.errorCode,'refund_review_ambiguous');
  assert.equal(database.documents.get('orders/order-1').status,'fulfilled');
  assert.equal(database.documents.get('commerceRefundReviewTotals/order-1').pendingAmountCents,2000);
});

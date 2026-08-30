import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCommerceService} from '../../src/commerce/commerce-service.js';

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
    realmId:'realm-1',
    invoiceId:'invoice-1',
    providerOrderRef:'bk-order-order-1',
    providerPaymentRef:'payment-1',
    currency:'USD',
    refund:{
      refundId:'refund-1',entityState:'present',status:'completed',amountCents:4900,
      invoiceId:'invoice-1',providerOrderRef:'bk-order-order-1',providerPaymentRef:'payment-1',currency:'USD',
    },
    ...overrides,
  };
}

function fixture({order = paidOrder, refundEvidence = exactRefundEvidence()} = {}) {
  const stored = structuredClone(order);
  const reviews = new Map();
  const audits = [];
  const calls = {getInvoice:0,getRefundEvidence:0,providerRefund:0};
  const repository = {
    async getOrder(id) { return id === stored.id ? stored : null; },
    async recordRefundReview(input) {
      const existing = reviews.get(input.idempotencyKey);
      if (existing) return {...existing,duplicate:true};
      const pending = [...reviews.values()].reduce((sum, review) => sum + review.amountCents, 0);
      if (pending + input.amountCents > input.verifiedUnrefundedAmountCents) {
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
      stored.status = 'refunded'; stored.refundedAmountCents = input.amountCents;
      audits.push({event:'refund_reconciled',orderId:input.orderId,amountCents:input.amountCents,adminUid:input.adminUid});
      return true;
    },
  };
  const quickbooks = {
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
  const {service,stored,calls,audits} = fixture();
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
    evidence => { evidence.refund.amountCents = 4899; },
    evidence => { evidence.refund.status = 'pending'; },
    evidence => { evidence.refund.entityState = 'deleted'; },
  ];
  for (const mutate of mutations) {
    const evidence = exactRefundEvidence(); mutate(evidence);
    const {service,stored} = fixture({refundEvidence:evidence});
    const result = await service.reconcileRefund({orderId:'order-1',amountCents:4900}, admin);
    assert.equal(result.reconciliation, 'manual_review');
    assert.equal(stored.status, 'fulfilled');
  }
});

test('admin results and audit receipts expose no customer, provider URL, or secret data', async () => {
  const {service,audits} = fixture();
  const result = await service.requestRefundReview({orderId:'order-1',amountCents:4900,reason:'Customer email exposed?'}, admin);
  const serialized = JSON.stringify({result,audits});
  assert.doesNotMatch(serialized, /@|https?:|realm-1|invoice-1|payment-1|customer|secret/i);
  assert.match(result.reviewHandle, /^[a-f0-9]{64}$/);
});

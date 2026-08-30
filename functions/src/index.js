import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore, FieldValue, Timestamp} from 'firebase-admin/firestore';
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import {createHash,randomUUID} from 'node:crypto';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onCall, onRequest, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret, defineString} from 'firebase-functions/params';
import {createGraphClient} from './providers/microsoft-graph.js';
import {createQuickBooksClient,refreshQuickBooksAccessToken} from './providers/quickbooks.js';
import {createAppointmentApprovalRepository,createIntegrationService} from './orchestration.js';
import {createCommerceService} from './commerce/commerce-service.js';
import {createOrderRepository} from './commerce/order-repository.js';
import {readCommerceFeatureFlags} from './commerce/feature-flags.js';
import {createLazyProvider} from './commerce/lazy-provider.js';
import {
  createFirestoreQuickBooksRefreshLeaseStore,
  createQuickBooksRefreshSecretStore,
  createQuickBooksTokenCoordinator,
} from './commerce/quickbooks-token-coordinator.js';
import {createQuickBooksWebhookProcessor} from './providers/quickbooks-webhooks.js';
import {buildMicrosoftAuthUrl,buildQuickBooksAuthUrl,exchangeMicrosoftCode,exchangeQuickBooksCode} from './providers/oauth.js';

initializeApp();
const REGION = 'us-west1';
const db = getFirestore();
const secretManager = new SecretManagerServiceClient();

const QBO_CLIENT_ID = defineSecret('QBO_CLIENT_ID');
const QBO_CLIENT_SECRET = defineSecret('QBO_CLIENT_SECRET');
const QBO_REFRESH_TOKEN = defineSecret('QBO_REFRESH_TOKEN');
const QBO_REALM_ID = defineSecret('QBO_REALM_ID');
const MS_TENANT_ID = defineSecret('MS_TENANT_ID');
const MS_CLIENT_ID = defineSecret('MS_CLIENT_ID');
const MS_CLIENT_SECRET = defineSecret('MS_CLIENT_SECRET');
const MS_REFRESH_TOKEN = defineSecret('MS_REFRESH_TOKEN');
const COMMERCE_PILOT_RECIPIENT_EMAIL = defineSecret('COMMERCE_PILOT_RECIPIENT_EMAIL');
const QBO_WEBHOOK_VERIFIER_TOKEN = defineSecret('QBO_WEBHOOK_VERIFIER_TOKEN');
const QBO_REDIRECT_URI = defineString('QBO_REDIRECT_URI',{default:'https://us-west1-the-ballers-kingdom.cloudfunctions.net/quickBooksOAuthCallback'});
const MS_REDIRECT_URI = defineString('MS_REDIRECT_URI',{default:'https://us-west1-the-ballers-kingdom.cloudfunctions.net/microsoftOAuthCallback'});

const QBO_SECRETS = [QBO_CLIENT_ID,QBO_CLIENT_SECRET,QBO_REFRESH_TOKEN,QBO_REALM_ID];
const MS_SECRETS = [MS_TENANT_ID,MS_CLIENT_ID,MS_CLIENT_SECRET,MS_REFRESH_TOKEN];
const ALL_SECRETS = [...QBO_SECRETS,...MS_SECRETS];
const COMMERCE_QBO_WEBHOOK_ENABLED = false;
const REFUND_PENDING_REVIEW_LIMIT = 100;

function auditRef(appointmentId) {
  return db.collection('integrationAudit').doc(`${appointmentId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
}

async function addSecretVersion(secretName, value) {
  if (!value) return;
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('Google Cloud project is unavailable');
  const secretPath = `projects/${projectId}/secrets/${secretName}`;
  await secretManager.addSecretVersion({
    parent:secretPath,
    payload:{data:Buffer.from(value,'utf8')},
  });
}

function requireAdmin(auth) {
  if (!auth?.uid || auth.token?.admin !== true) throw new HttpsError('permission-denied','An authenticated administrator is required');
}

async function createOAuthState(provider, uid) {
  const state = randomUUID();
  await db.collection('oauthStates').doc(state).set({provider,uid,expiresAt:Timestamp.fromMillis(Date.now()+10*60*1000),createdAt:FieldValue.serverTimestamp()});
  return state;
}

async function consumeOAuthState(state, provider) {
  return db.runTransaction(async transaction => {
    const reference = db.collection('oauthStates').doc(state);
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    if (!snapshot.exists || data.provider !== provider || data.expiresAt.toMillis() < Date.now()) throw new Error('OAuth state is invalid or expired');
    transaction.delete(reference);
    return data;
  });
}

function connectionHtml(provider) {
  return `<!doctype html><meta charset="utf-8"><title>${provider} connected</title><body style="font:18px system-ui;padding:40px"><h1>${provider} connected</h1><p>You can close this window and return to The Ballers Kingdom.</p></body>`;
}

function firestoreRepository() {
  const ref = id => db.collection('appointments').doc(id);
  const approvalRepository=createAppointmentApprovalRepository({
    db,fieldValue:FieldValue,Timestamp,auditRef,clock:()=>new Date(),claimIdFactory:randomUUID,
  });
  return {
    ...approvalRepository,
    claimConfirmation: id => db.runTransaction(async transaction => {
      const appointmentRef = ref(id);
      const snapshot = await transaction.get(appointmentRef);
      const data = snapshot.data();
      if (!snapshot.exists || data.status !== 'accepted' || ['sending','sent'].includes(data.confirmation?.status)) return false;
      transaction.update(appointmentRef, {'confirmation.status':'sending','confirmation.claimedAt':FieldValue.serverTimestamp()});
      transaction.set(auditRef(id), {appointmentId:id,event:'confirmation_claimed',createdAt:FieldValue.serverTimestamp()});
      return true;
    }),
    completeConfirmation: (id, receipt) => db.runTransaction(async transaction => {
      transaction.update(ref(id), {'confirmation.status':'sent','confirmation.sentAt':FieldValue.serverTimestamp()});
      transaction.set(auditRef(id), {appointmentId:id,event:'confirmation_sent',receipt,createdAt:FieldValue.serverTimestamp()});
    }),
    failConfirmation: (id, error) => db.runTransaction(async transaction => {
      transaction.update(ref(id), {'confirmation.status':'failed','confirmation.error':error.message,'confirmation.failedAt':FieldValue.serverTimestamp()});
      transaction.set(auditRef(id), {appointmentId:id,event:'confirmation_failed',error:error.message,createdAt:FieldValue.serverTimestamp()});
    }),
    async listAcceptedBefore(cutoff) {
      const snapshot = await db.collection('appointments').where('status','==','accepted').where('startsAt','<=',Timestamp.fromDate(cutoff)).get();
      return snapshot.docs.map(document => ({id:document.id,...document.data()}));
    },
    stageApproval: (id, data) => db.runTransaction(async transaction => {
      const appointmentRef = ref(id);
      const snapshot = await transaction.get(appointmentRef);
      const status = snapshot.data()?.invoiceApproval?.status;
      if (!snapshot.exists || ['pending','processing','completed'].includes(status)) return false;
      transaction.update(appointmentRef, {
        'invoiceApproval.status':'pending',
        'invoiceApproval.stagedAt':FieldValue.serverTimestamp(),
        'invoiceApproval.dueAt':Timestamp.fromDate(data.dueAt),
      });
      transaction.set(auditRef(id), {appointmentId:id,event:'invoice_approval_staged',createdAt:FieldValue.serverTimestamp()});
      return true;
    }),
  };
}

function graphClient() {
  return createGraphClient({
    tenantId:MS_TENANT_ID.value(),clientId:MS_CLIENT_ID.value(),clientSecret:MS_CLIENT_SECRET.value(),
    refreshToken:MS_REFRESH_TOKEN.value(),sender:'info@ballkingdom.com',
    onRefreshToken: token => addSecretVersion('MS_REFRESH_TOKEN', token),
  });
}

let qboTokenCoordinator;
function quickBooksTokenCoordinator() {
  if (qboTokenCoordinator) return qboTokenCoordinator;
  const projectId=process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('Google Cloud project is unavailable');
  qboTokenCoordinator=createQuickBooksTokenCoordinator({
    secretStore:createQuickBooksRefreshSecretStore({client:secretManager,projectId}),
    leaseStore:createFirestoreQuickBooksRefreshLeaseStore({db}),
    refresh:refreshToken=>refreshQuickBooksAccessToken({
      clientId:QBO_CLIENT_ID.value(),clientSecret:QBO_CLIENT_SECRET.value(),refreshToken,
    }),
  });
  return qboTokenCoordinator;
}

function quickBooksClient() {
  return createQuickBooksClient({
    realmId:QBO_REALM_ID.value(),accessTokenProvider:quickBooksTokenCoordinator(),
  });
}

function lazyGraphClient() {
  return createLazyProvider(graphClient, [
    'sendPilotAuthLink','sendConfirmation','sendInvoice',
  ]);
}

function lazyQuickBooksClient() {
  const provider = createLazyProvider(quickBooksClient, [
    'createCommerceInvoice','sendInvoice','getInvoice','getPayment','getAccountingChanges','getRefundEvidence',
  ]);
  return Object.freeze({...provider,refundEvidenceCapability:false});
}

export function createRefundControlRepository({db:database,fieldValue,baseRepository = {}} = {}) {
  if (!database?.collection || !database?.runTransaction || !fieldValue?.serverTimestamp) {
    throw new TypeError('Refund repository dependencies are required');
  }
  const reviews = database.collection('commerceRefundReviews');
  const reviewTotals = database.collection('commerceRefundReviewTotals');
  const orders = database.collection('orders');
  const audits = database.collection('commerceAudit');
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
  const safeDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const audit = fields => ({...fields,createdAt:fieldValue.serverTimestamp()});
  const bindingFor = order => createHash('sha256').update(
    `refund-order-binding\0${order.providerRefs?.realmId}\0${order.providerRefs?.invoiceId}\0${order.providerRefs?.providerOrderRef}`
  ).digest('hex');
  return Object.freeze({
    ...baseRepository,
    async recordRefundReview(input = {}) {
      if (!safeId(input.orderId) || !safeId(input.adminUid) || !safeDigest(input.idempotencyKey)
        || !safeDigest(input.orderBinding)
        || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0
        || !Number.isSafeInteger(input.authoritativeTotalAmountCents)
        || !Number.isSafeInteger(input.authoritativeRefundedAmountCents)
        || typeof input.reason !== 'string' || input.reason.length < 1 || input.reason.length > 500
        || input.reason !== input.reason.trim()) {
        throw new Error('Refund review is invalid');
      }
      const reference = reviews.doc(input.idempotencyKey);
      const totalReference = reviewTotals.doc(input.orderId);
      const orderReference = orders.doc(input.orderId);
      const receipt = audits.doc();
      return database.runTransaction(async transaction => {
        const [existing,totalSnapshot,orderSnapshot] = await Promise.all([
          transaction.get(reference),transaction.get(totalReference),transaction.get(orderReference),
        ]);
        const order = orderSnapshot.data();
        if (!orderSnapshot.exists || !['paid','fulfilled'].includes(order.status)
          || order.amountCents !== input.authoritativeTotalAmountCents
          || Number(order.refundedAmountCents ?? 0) !== input.authoritativeRefundedAmountCents
          || bindingFor(order) !== input.orderBinding) {
          const error = new Error('Refund state changed');
          error.code = 'REFUND_STATE_CONFLICT';
          throw error;
        }
        if (existing.exists) {
          const data = existing.data();
          return {reviewId:reference.id,amountCents:data.amountCents,status:data.status,duplicate:true};
        }
        const pendingAmountCents = Number(totalSnapshot.data()?.pendingAmountCents ?? 0);
        const authoritativeUnrefundedAmountCents = order.amountCents
          - Number(order.refundedAmountCents ?? 0);
        if (!Number.isSafeInteger(pendingAmountCents)
          || pendingAmountCents + input.amountCents > authoritativeUnrefundedAmountCents) {
          const error = new Error('Refund amount is invalid');
          error.code = 'REFUND_AMOUNT_INVALID';
          throw error;
        }
        transaction.create(reference, {
          orderId:input.orderId,amountCents:input.amountCents,reason:input.reason,
          requestedByUid:input.adminUid,status:'pending_operator_action',
          createdAt:fieldValue.serverTimestamp(),updatedAt:fieldValue.serverTimestamp(),
        });
        transaction.set(totalReference, {
          orderId:input.orderId,pendingAmountCents:pendingAmountCents + input.amountCents,
          updatedAt:fieldValue.serverTimestamp(),
        });
        transaction.create(receipt,audit({
          orderId:input.orderId,event:'refund_review_requested',amountCents:input.amountCents,
          actorUid:input.adminUid,
        }));
        return {reviewId:reference.id,amountCents:input.amountCents,status:'pending_operator_action',duplicate:false};
      });
    },
    async recordRefundManualReview({orderId,adminUid,errorCode} = {}) {
      if (!safeId(orderId) || !safeId(adminUid)
        || typeof errorCode !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(errorCode)) {
        throw new Error('Refund reconciliation is invalid');
      }
      const reference = orders.doc(orderId);
      const receipt = audits.doc();
      return database.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists || !['paid','fulfilled'].includes(snapshot.data().status)) return false;
        transaction.update(reference,{
          refundReconciliation:{status:'manual_review',errorCode,updatedAt:fieldValue.serverTimestamp()},
          updatedAt:fieldValue.serverTimestamp(),
        });
        transaction.create(receipt,audit({orderId,event:'refund_manual_review',errorCode,actorUid:adminUid}));
        return true;
      });
    },
    async completeRefundReconciliation(input = {}) {
      const {orderId,amountCents,adminUid,evidenceId} = input;
      if (!safeId(orderId) || !safeId(adminUid) || !safeDigest(evidenceId) || !safeDigest(input.orderBinding)
        || !safeDigest(input.reviewId)
        || !['paid','fulfilled'].includes(input.expectedStatus)
        || !Number.isSafeInteger(input.expectedRefundedAmountCents)
        || !Number.isSafeInteger(input.cumulativeRefundedAmountCents)
        || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
        throw new Error('Refund reconciliation is invalid');
      }
      const reference = orders.doc(orderId);
      const receipt = audits.doc();
      const totalReference = reviewTotals.doc(orderId);
      const pendingReviews = reviews.where('orderId','==',orderId)
        .where('status','==','pending_operator_action')
        .limit(REFUND_PENDING_REVIEW_LIMIT+1);
      return database.runTransaction(async transaction => {
        const [snapshot,totalSnapshot,pendingSnapshot] = await Promise.all([
          transaction.get(reference),transaction.get(totalReference),transaction.get(pendingReviews),
        ]);
        if (!snapshot.exists) throw new Error('Order was not found');
        const order = snapshot.data();
        if (order.refundEvidenceId === evidenceId
          && order.refundedAmountCents === input.cumulativeRefundedAmountCents
          && order.lastReconciledRefundAmountCents === amountCents) {
          return {completed:order.status === 'refunded',duplicate:true,status:order.status};
        }
        const conflict = order.status !== input.expectedStatus
          || Number(order.refundedAmountCents ?? 0) !== input.expectedRefundedAmountCents
          || bindingFor(order) !== input.orderBinding
          || input.cumulativeRefundedAmountCents !== input.expectedRefundedAmountCents + amountCents
          || input.cumulativeRefundedAmountCents > Number(order.amountCents);
        if (conflict) {
          if (['paid','fulfilled'].includes(order.status)) transaction.update(reference,{
            refundReconciliation:{status:'manual_review',errorCode:'refund_state_conflict'},
            updatedAt:fieldValue.serverTimestamp(),
          });
          transaction.create(receipt,audit({
            orderId,event:'refund_manual_review',errorCode:'refund_state_conflict',actorUid:adminUid,
          }));
          return {completed:false,duplicate:false,status:order.status,errorCode:'refund_state_conflict'};
        }
        const pendingAmountCents = Number(totalSnapshot.data()?.pendingAmountCents ?? 0);
        const pendingDocuments = pendingSnapshot.docs ?? [];
        const failReviewIntegrity = errorCode => {
          transaction.create(receipt,audit({
            orderId,event:'refund_manual_review',errorCode,actorUid:adminUid,
          }));
          return {completed:false,duplicate:false,status:order.status,errorCode};
        };
        if (pendingDocuments.length > REFUND_PENDING_REVIEW_LIMIT) {
          return failReviewIntegrity('refund_review_limit_exceeded');
        }
        let recomputedPendingAmountCents = 0;
        for (const document of pendingDocuments) {
          const review = document.data();
          if (!Number.isSafeInteger(review.amountCents) || review.amountCents <= 0) {
            return failReviewIntegrity('refund_review_amount_invalid');
          }
          recomputedPendingAmountCents += review.amountCents;
          if (!Number.isSafeInteger(recomputedPendingAmountCents)) {
            return failReviewIntegrity('refund_review_total_invalid');
          }
        }
        if (!Number.isSafeInteger(pendingAmountCents)
          || pendingAmountCents !== recomputedPendingAmountCents) {
          return failReviewIntegrity('refund_review_total_conflict');
        }
        const matchingDocuments = pendingDocuments.filter(document => document.data().amountCents === amountCents);
        if (matchingDocuments.length !== 1) return failReviewIntegrity(
          matchingDocuments.length > 1 ? 'refund_review_ambiguous' : 'refund_review_missing'
        );
        const matchingReview = matchingDocuments[0];
        if (matchingReview.id !== input.reviewId) {
          return failReviewIntegrity('refund_review_id_mismatch');
        }
        const remainingPendingAmountCents = recomputedPendingAmountCents-amountCents;
        transaction.update(matchingReview.ref,{
          status:'resolved',resolvedByUid:adminUid,resolutionEvidenceId:evidenceId,
          resolvedAt:fieldValue.serverTimestamp(),updatedAt:fieldValue.serverTimestamp(),
        });
        transaction.set(totalReference,{
          orderId,pendingAmountCents:remainingPendingAmountCents,
          updatedAt:fieldValue.serverTimestamp(),
        });
        if (input.cumulativeRefundedAmountCents < order.amountCents) {
          transaction.update(reference,{
            refundedAmountCents:input.cumulativeRefundedAmountCents,refundEvidenceId:evidenceId,
            lastReconciledRefundAmountCents:amountCents,
            refundReconciliation:{status:'manual_review',errorCode:'partial_refund_requires_manual_review'},
            updatedAt:fieldValue.serverTimestamp(),
          });
          transaction.create(receipt,audit({
            orderId,event:'refund_manual_review',amountCents,
            errorCode:'partial_refund_requires_manual_review',actorUid:adminUid,evidenceId,
          }));
          return {completed:false,duplicate:false,status:order.status,errorCode:'partial_refund_requires_manual_review'};
        }
        transaction.update(reference,{
          status:'refunded',terminal:true,refundedAmountCents:input.cumulativeRefundedAmountCents,
          lastReconciledRefundAmountCents:amountCents,
          refundEvidenceId:evidenceId,refundReconciliation:{status:'exact_accounting_refund'},
          activeTransition:null,reconciliationDueAt:null,updatedAt:fieldValue.serverTimestamp(),
        });
        transaction.create(receipt,audit({
          orderId,event:'refund_reconciled',amountCents,actorUid:adminUid,evidenceId,
        }));
        return {completed:true,duplicate:false,status:'refunded'};
      });
    },
  });
}

function commerceRepository() {
  return createRefundControlRepository({
    db,fieldValue:FieldValue,
    baseRepository:createOrderRepository({db,fieldValue:FieldValue,Timestamp}),
  });
}

function commerceHttpsError(error) {
  if (error?.code === 'AUTH_REQUIRED') return new HttpsError('unauthenticated','Authentication is required');
  if (error?.code === 'AUTH_SESSION_INVALID') {
    return new HttpsError('unauthenticated','Authentication is no longer valid');
  }
  if (['VERIFIED_EMAIL_REQUIRED','PILOT_RECIPIENT_REQUIRED','ADMIN_REQUIRED'].includes(error?.code)) {
    return new HttpsError('permission-denied','This operation is not permitted');
  }
  if (error?.code === 'ORDER_NOT_FOUND') return new HttpsError('not-found','Order was not found');
  if (['ORDER_INVALID','REFUND_AMOUNT_INVALID','REFUND_REASON_INVALID'].includes(error?.code)) {
    return new HttpsError('invalid-argument','Request data is invalid');
  }
  if (error?.code === 'RATE_LIMITED') return new HttpsError('resource-exhausted','Try again later');
  return new HttpsError('failed-precondition','Commerce operation could not be completed');
}

function runtimeCommerceService({withPilotEmail = false, withQuickBooks = false, withGraph = false} = {}) {
  const repository = commerceRepository();
  return createCommerceService({
    repository,
    quickbooks:withQuickBooks ? lazyQuickBooksClient() : null,
    graph:withGraph ? lazyGraphClient() : null,
    auth:withPilotEmail ? {
      generateSignInWithEmailLink:(email, settings) => getAuth().generateSignInWithEmailLink(email, settings),
    } : null,
    getApprovedPilotEmail:withPilotEmail
      ? () => COMMERCE_PILOT_RECIPIENT_EMAIL.value()
      : () => { throw new Error('Pilot recipient secret is unavailable'); },
    getCurrentUser:uid => getAuth().getUser(uid),
    authRequestLimiter:key => repository.consumeRateLimit(
      'pilot_auth',key,new Date(),{limit:5,windowMs:10 * 60 * 1000}
    ),
    statusRequestLimiter:key => repository.consumeRateLimit(
      'order_status',key,new Date(),{limit:60,windowMs:10 * 60 * 1000}
    ),
    fulfillDigitalOrder:order => repository.grantDigitalFulfillment(order.id),
    alertOperator:alert => repository.recordOperatorAlert(alert),
  });
}

export const requestPilotSignInLink = onCall({
  region:REGION,
  secrets:[COMMERCE_PILOT_RECIPIENT_EMAIL,...MS_SECRETS],
  enforceAppCheck:true,
}, async request => {
  try {
    const service = runtimeCommerceService({withPilotEmail:true,withGraph:true});
    return await service.requestPilotSignInLink(request.data, {app:request.app});
  } catch {
    return {status:'request_received'};
  }
});

export const createDigitalOrder = onCall({
  region:REGION,
  secrets:[COMMERCE_PILOT_RECIPIENT_EMAIL,...QBO_SECRETS],
  enforceAppCheck:true,
}, async request => {
  try {
    const service = runtimeCommerceService({withPilotEmail:true,withQuickBooks:true});
    return await service.createDigitalOrder(request.data, request.auth);
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

export const getOrderStatus = onCall({region:REGION,enforceAppCheck:true}, async request => {
  try {
    const service = runtimeCommerceService();
    return await service.getOrderStatus(request.data, request.auth);
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

export const getBuyerCommerceCapability = onCall({region:REGION,enforceAppCheck:true}, async request => {
  try {
    const service = runtimeCommerceService();
    return await service.getBuyerCommerceCapability({app:request.app});
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

export const verifyOrderPayment = onCall({
  region:REGION,
  secrets:QBO_SECRETS,
  enforceAppCheck:true,
}, async request => {
  requireAdmin(request.auth);
  try {
    const service = runtimeCommerceService({withQuickBooks:true});
    return await service.verifyOrderPayment({
      orderId:String(request.data?.orderId ?? ''),
      source:'admin',
    });
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

export const getCommerceReleaseState = onCall({region:REGION,enforceAppCheck:true}, async request => {
  try {
    const service = runtimeCommerceService();
    return await service.getCommerceReleaseState({
      uid:request.auth?.uid,
      token:request.auth?.token,
      app:request.app,
    });
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

function adminCommerceContext(request) {
  return {uid:request.auth?.uid,token:request.auth?.token,app:request.app};
}

export const requestRefundReview = onCall({
  region:REGION,secrets:QBO_SECRETS,enforceAppCheck:true,
}, async request => {
  try {
    const service = runtimeCommerceService({withQuickBooks:true});
    return await service.requestRefundReview(request.data, adminCommerceContext(request));
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

export const reconcileOrder = onCall({
  region:REGION,secrets:QBO_SECRETS,enforceAppCheck:true,
}, async request => {
  try {
    const service = runtimeCommerceService({withQuickBooks:true});
    return await service.reconcileOrder(request.data, adminCommerceContext(request));
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

export const reconcileRefund = onCall({
  region:REGION,secrets:QBO_SECRETS,enforceAppCheck:true,
}, async request => {
  try {
    const service = runtimeCommerceService({withQuickBooks:true});
    return await service.reconcileRefund(request.data, adminCommerceContext(request));
  } catch (error) {
    throw commerceHttpsError(error);
  }
});

export const quickBooksCommerceWebhook = onRequest({
  region:REGION,
  secrets:[QBO_WEBHOOK_VERIFIER_TOKEN,QBO_REALM_ID],
}, async (request,response) => {
  if (COMMERCE_QBO_WEBHOOK_ENABLED !== true || readCommerceFeatureFlags().digitalInvoicePilotEnabled !== true) {
    response.status(404).send('Not found');
    return;
  }
  try {
    const repository = commerceRepository();
    const processor = createQuickBooksWebhookProcessor({
      verifierToken:QBO_WEBHOOK_VERIFIER_TOKEN.value(),
      expectedRealmId:QBO_REALM_ID.value(),
      storeHints:entries => repository.storeWebhookHints(entries),
    });
    await processor.acceptQuickBooksWebhook({
      rawBody:request.rawBody,
      signature:String(request.get('intuit-signature') ?? ''),
    });
    response.status(200).send('Accepted');
  } catch (error) {
    if (error?.code === 'WEBHOOK_SIGNATURE_INVALID') response.status(401).send('Rejected');
    else if (error?.code === 'WEBHOOK_REALM_INVALID') response.status(403).send('Rejected');
    else response.status(400).send('Rejected');
  }
});

export const reconcileCommerceOrders = onSchedule({schedule:'every 5 minutes',
  timeZone:'America/Los_Angeles',region:REGION,
  secrets:QBO_SECRETS,
}, async () => {
  const service = runtimeCommerceService({withQuickBooks:true});
  await service.reconcilePendingOrders(new Date());
});

export const dispatchCommerceEffects = onSchedule({schedule:'every 5 minutes',
  timeZone:'America/Los_Angeles',region:REGION,
  secrets:[COMMERCE_PILOT_RECIPIENT_EMAIL,...QBO_SECRETS,...MS_SECRETS],
}, async () => {
  const service = runtimeCommerceService({withPilotEmail:true,withQuickBooks:true,withGraph:true});
  await service.dispatchPendingEffects(new Date());
});

export const confirmAcceptedBooking = onDocumentWritten({document:'appointments/{appointmentId}',region:REGION,secrets:MS_SECRETS}, async event => {
  const data = event.data?.after?.data();
  if (!data) return;
  const service = createIntegrationService({
    repository:firestoreRepository(),graph:graphClient(),quickbooks:null,
    commerce:runtimeCommerceService(),readFeatureFlags:readCommerceFeatureFlags,
  });
  await service.confirmAcceptedBooking(event.params.appointmentId, data);
});

export const stageInvoiceApprovals = onSchedule({schedule:'every 60 minutes',timeZone:'America/Los_Angeles',region:REGION}, async () => {
  const service = createIntegrationService({repository:firestoreRepository(),graph:null,quickbooks:null});
  await service.stageDueApprovals();
});

export const approveInvoice = onCall({region:REGION,secrets:ALL_SECRETS,enforceAppCheck:true}, async request => {
  const appointmentId = String(request.data?.appointmentId ?? '').trim();
  if (!appointmentId) throw new HttpsError('invalid-argument','appointmentId is required');
  try {
    const service = createIntegrationService({
      repository:firestoreRepository(),graph:graphClient(),quickbooks:quickBooksClient(),
      commerce:runtimeCommerceService({withQuickBooks:true}),readFeatureFlags:readCommerceFeatureFlags,
    });
    return await service.approveInvoice({appointmentId,auth:request.auth});
  } catch (error) {
    if (/administrator/.test(error.message)) throw new HttpsError('permission-denied',error.message);
    throw new HttpsError('failed-precondition','Invoice approval could not be completed');
  }
});

export const beginQuickBooksConnection = onCall({region:REGION,secrets:[QBO_CLIENT_ID],enforceAppCheck:true}, async request => {
  requireAdmin(request.auth);
  const state = await createOAuthState('quickbooks',request.auth.uid);
  return {url:buildQuickBooksAuthUrl({clientId:QBO_CLIENT_ID.value(),redirectUri:QBO_REDIRECT_URI.value(),state})};
});

export const quickBooksOAuthCallback = onRequest({region:REGION,secrets:[QBO_CLIENT_ID,QBO_CLIENT_SECRET]}, async (request,response) => {
  try {
    await consumeOAuthState(String(request.query.state||''),'quickbooks');
    const code = String(request.query.code||'');
    const realmId = String(request.query.realmId||'');
    if (!code || !realmId) throw new Error('QuickBooks callback is incomplete');
    const tokens = await exchangeQuickBooksCode({clientId:QBO_CLIENT_ID.value(),clientSecret:QBO_CLIENT_SECRET.value(),redirectUri:QBO_REDIRECT_URI.value(),code});
    await Promise.all([addSecretVersion('QBO_REFRESH_TOKEN',tokens.refreshToken),addSecretVersion('QBO_REALM_ID',realmId)]);
    response.status(200).send(connectionHtml('QuickBooks'));
  } catch (error) {
    response.status(400).send('QuickBooks connection failed. Return to the application and try again.');
  }
});

export const beginMicrosoftConnection = onCall({region:REGION,secrets:[MS_TENANT_ID,MS_CLIENT_ID],enforceAppCheck:true}, async request => {
  requireAdmin(request.auth);
  const state = await createOAuthState('microsoft',request.auth.uid);
  return {url:buildMicrosoftAuthUrl({tenantId:MS_TENANT_ID.value(),clientId:MS_CLIENT_ID.value(),redirectUri:MS_REDIRECT_URI.value(),state})};
});

export const microsoftOAuthCallback = onRequest({region:REGION,secrets:[MS_TENANT_ID,MS_CLIENT_ID,MS_CLIENT_SECRET]}, async (request,response) => {
  try {
    await consumeOAuthState(String(request.query.state||''),'microsoft');
    const code = String(request.query.code||'');
    if (!code) throw new Error('Microsoft callback is incomplete');
    const tokens = await exchangeMicrosoftCode({tenantId:MS_TENANT_ID.value(),clientId:MS_CLIENT_ID.value(),clientSecret:MS_CLIENT_SECRET.value(),redirectUri:MS_REDIRECT_URI.value(),code});
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:{authorization:`Bearer ${tokens.accessToken}`}});
    if (!profileResponse.ok) throw new Error('Microsoft mailbox verification failed');
    const profile = await profileResponse.json();
    const mailbox = String(profile.mail||profile.userPrincipalName||'').toLowerCase();
    if (mailbox !== 'info@ballkingdom.com') throw new Error('The connected Microsoft account is not info@ballkingdom.com');
    await addSecretVersion('MS_REFRESH_TOKEN',tokens.refreshToken);
    response.status(200).send(connectionHtml('Microsoft 365'));
  } catch (error) {
    response.status(400).send('Microsoft connection failed. Sign in as info@ballkingdom.com and try again.');
  }
});

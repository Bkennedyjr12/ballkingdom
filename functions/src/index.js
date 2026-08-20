import {initializeApp} from 'firebase-admin/app';
import {getFirestore, FieldValue, Timestamp} from 'firebase-admin/firestore';
import {SecretManagerServiceClient} from '@google-cloud/secret-manager';
import {randomUUID} from 'node:crypto';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onCall, onRequest, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret, defineString} from 'firebase-functions/params';
import {createGraphClient} from './providers/microsoft-graph.js';
import {createQuickBooksClient} from './providers/quickbooks.js';
import {createIntegrationService} from './orchestration.js';
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
const QBO_REDIRECT_URI = defineString('QBO_REDIRECT_URI',{default:'https://us-west1-the-ballers-kingdom.cloudfunctions.net/quickBooksOAuthCallback'});
const MS_REDIRECT_URI = defineString('MS_REDIRECT_URI',{default:'https://us-west1-the-ballers-kingdom.cloudfunctions.net/microsoftOAuthCallback'});

const QBO_SECRETS = [QBO_CLIENT_ID,QBO_CLIENT_SECRET,QBO_REFRESH_TOKEN,QBO_REALM_ID];
const MS_SECRETS = [MS_TENANT_ID,MS_CLIENT_ID,MS_CLIENT_SECRET,MS_REFRESH_TOKEN];
const ALL_SECRETS = [...QBO_SECRETS,...MS_SECRETS];

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
  return {
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
    claimApproval: (id, uid) => db.runTransaction(async transaction => {
      const appointmentRef = ref(id);
      const snapshot = await transaction.get(appointmentRef);
      const data = snapshot.data();
      if (!snapshot.exists || data.invoiceApproval?.status !== 'pending') return null;
      transaction.update(appointmentRef, {
        'invoiceApproval.status':'processing','invoiceApproval.approvedBy':uid,'invoiceApproval.approvedAt':FieldValue.serverTimestamp(),
      });
      transaction.set(auditRef(id), {appointmentId:id,event:'invoice_approval_claimed',approvedBy:uid,createdAt:FieldValue.serverTimestamp()});
      return {id,...data};
    }),
    completeApproval: (id, receipt) => db.runTransaction(async transaction => {
      transaction.update(ref(id), {'invoiceApproval.status':'completed','invoiceApproval.completedAt':FieldValue.serverTimestamp(),'invoiceApproval.receipt':receipt});
      transaction.set(auditRef(id), {appointmentId:id,event:'invoice_delivered',receipt,createdAt:FieldValue.serverTimestamp()});
    }),
    failApproval: (id, error) => db.runTransaction(async transaction => {
      transaction.update(ref(id), {'invoiceApproval.status':'pending','invoiceApproval.lastError':error.message,'invoiceApproval.failedAt':FieldValue.serverTimestamp()});
      transaction.set(auditRef(id), {appointmentId:id,event:'invoice_delivery_failed',error:error.message,createdAt:FieldValue.serverTimestamp()});
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

function quickBooksClient() {
  return createQuickBooksClient({
    clientId:QBO_CLIENT_ID.value(),clientSecret:QBO_CLIENT_SECRET.value(),refreshToken:QBO_REFRESH_TOKEN.value(),realmId:QBO_REALM_ID.value(),
    onRefreshToken: token => addSecretVersion('QBO_REFRESH_TOKEN', token),
  });
}

export const confirmAcceptedBooking = onDocumentWritten({document:'appointments/{appointmentId}',region:REGION,secrets:MS_SECRETS}, async event => {
  const data = event.data?.after?.data();
  if (!data) return;
  const service = createIntegrationService({repository:firestoreRepository(),graph:graphClient(),quickbooks:null});
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
    const service = createIntegrationService({repository:firestoreRepository(),graph:graphClient(),quickbooks:quickBooksClient()});
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

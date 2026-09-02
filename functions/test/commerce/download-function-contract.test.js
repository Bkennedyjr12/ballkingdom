import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sourceUrl=new URL('../../src/index.js',import.meta.url);
const transportUrl=new URL('../../src/commerce/download-http.js',import.meta.url);
const protectedExports=['createDownloadGrant','redeemDownloadGrant'];
const existingScopedExports=[
  'requestPilotSignInLink','createDigitalOrder','getOrderStatus',
  'getBuyerCommerceCapability','verifyOrderPayment','getCommerceReleaseState',
  'getQuickBooksCommerceHealth',
  'requestRefundReview','reconcileOrder','reconcileRefund','quickBooksCommerceWebhook',
  'reconcileCommerceOrders','dispatchCommerceEffects','stageInvoiceApprovals','approveInvoice',
  'beginQuickBooksConnection','quickBooksOAuthCallback','beginMicrosoftConnection',
  'microsoftOAuthCallback',
];
const scopedDeploymentInventory=[...existingScopedExports,...protectedExports];

test('exports both protected endpoints with their required Firebase protections', async () => {
  const source=await readFile(sourceUrl,'utf8');
  const transport=await readFile(transportUrl,'utf8');
  assert.match(source,/export const createDownloadGrant = onCall\(\{[^}]*region:REGION[^}]*enforceAppCheck:true[^}]*\}/s);
  assert.match(source,/createDownloadGrant\(\s*\{orderId:String\(request\.data\?\.orderHandle \?\? ''\)\}/s);
  assert.match(source,/export const redeemDownloadGrant = onRequest\(\{region:REGION\}/);
  assert.match(source,/getAuth\(\)\.verifyIdToken|auth:getAuth\(\)/);
  assert.match(source,/getAppCheck\(\)/);
  assert.match(source,/getStorage\(\)\.bucket\(/);
  assert.match(source,/readFirebaseBearerToken\(request\.rawRequest\)/);
  assert.match(source,/typeof request\.auth\?\.uid !== 'string'/);
  assert.match(transport,/verifyIdToken\([^,]+,true\)/);
  assert.match(transport,/getUser\(/);
  assert.match(transport,/verifyToken\([^,]+,\{consume:true\}\)/);
  assert.match(transport,/alreadyConsumed/);
  assert.match(source,/expectedUid:request\.auth\?\.uid/);
  assert.match(source,/auth:authoritativeUser/);
});

test('binds neither protected endpoint to QuickBooks, Microsoft, nor recipient secrets', async () => {
  const source=await readFile(sourceUrl,'utf8');
  for (const name of protectedExports) {
    const start=source.indexOf(`export const ${name} = `);
    assert.notEqual(start,-1,`missing ${name}`);
    const next=source.indexOf('\nexport const ',start + 1);
    const declaration=source.slice(start,next === -1 ? source.length : next);
    assert.doesNotMatch(declaration,/secrets\s*:|QBO_|MS_|COMMERCE_PILOT_RECIPIENT_EMAIL|quickBooks|graph/i);
  }
});

test('keeps the public auth callable behind Firebase App Check transport rejection and generic valid-request results', async () => {
  const source=await readFile(sourceUrl,'utf8');
  const start=source.indexOf('export const requestPilotSignInLink = ');
  const next=source.indexOf('\nexport const ',start + 1);
  const declaration=source.slice(start,next);
  assert.match(declaration,/enforceAppCheck:true/);
  assert.match(declaration,/APP_CHECK_TRANSPORT_CONTRACT/);
  assert.match(declaration,/return \{status:'request_received'\};/);
});

test('protects QuickBooks commerce health with admin auth, App Check, and redacted read-only wiring', async () => {
  const source=await readFile(sourceUrl,'utf8');
  const start=source.indexOf('export const getQuickBooksCommerceHealth = ');
  const next=source.indexOf('\nexport const ',start + 1);
  const declaration=source.slice(start,next);
  assert.notEqual(start,-1);
  assert.match(declaration,/secrets:QBO_RUNTIME_SECRETS/);
  assert.match(declaration,/enforceAppCheck:true/);
  assert.ok(declaration.indexOf('requireAdmin(request.auth)') < declaration.indexOf('runQuickBooksCommerceHealth'));
  assert.match(declaration,/requestTimeoutMs:credentials\.requestTimeoutMs/);
  assert.doesNotMatch(declaration,/request\.data/);
  assert.doesNotMatch(declaration,/createCustomer|createInvoice|sendInvoice|sendMail|sendMessage/);
});

test('scoped deployment inventory contains exactly 21 reviewed exports and excludes legacy booking send', async () => {
  const source=await readFile(sourceUrl,'utf8');
  assert.equal(scopedDeploymentInventory.length,21);
  assert.equal(new Set(scopedDeploymentInventory).size,21);
  for (const name of scopedDeploymentInventory) {
    assert.match(source,new RegExp(`export const ${name} = `),name);
  }
  assert.equal(scopedDeploymentInventory.includes('createDownloadGrant'),true);
  assert.equal(scopedDeploymentInventory.includes('redeemDownloadGrant'),true);
  assert.equal(scopedDeploymentInventory.includes('confirmAcceptedBooking'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFirebaseCommerceRuntime } from '../assets/js/firebase-commerce-runtime.js';
import { validateCapabilityResponse } from '../assets/js/commerce-client.js';

const verifiedPublicConfig = Object.freeze({
  apiKey: 'verified-public-api-key',
  authDomain: 'the-ballers-kingdom.firebaseapp.com',
  projectId: 'the-ballers-kingdom',
  storageBucket: 'the-ballers-kingdom.firebasestorage.app',
  messagingSenderId: '78885961453',
  appId: '1:78885961453:web:verified',
});

const genericError = /Unable to complete the secure identity check\./;

function createSdk({
  currentUser = { getIdToken: async forceRefresh => forceRefresh ? 'verified-id-token' : '' },
  appCheckToken = { token: 'verified-app-check-token' },
  limitedUseToken = { token: 'verified-limited-use-token' },
  emailLink = true,
  signInResult = { user: { email: 'buyer@example.test' } },
} = {}) {
  const calls = [];
  const app = Object.freeze({ name: 'app' });
  const auth = { currentUser };
  const appCheck = Object.freeze({ name: 'app-check' });
  const inMemoryPersistence = Object.freeze({ type: 'NONE' });
  class ReCaptchaEnterpriseProvider {
    constructor(siteKey) { calls.push(['provider', siteKey]); }
  }
  return {
    calls,
    initializeApp(config) { calls.push(['initializeApp', config]); return app; },
    initializeAuth(receivedApp, dependencies) { calls.push(['initializeAuth', receivedApp, dependencies]); return auth; },
    getAuth() { calls.push(['getAuth']); return auth; },
    inMemoryPersistence,
    setPersistence(receivedAuth, persistence) { calls.push(['setPersistence', receivedAuth, persistence]); return Promise.resolve(); },
    signOut(receivedAuth) { calls.push(['signOut', receivedAuth]); receivedAuth.currentUser = null; return Promise.resolve(); },
    ReCaptchaEnterpriseProvider,
    initializeAppCheck(receivedApp, options) { calls.push(['initializeAppCheck', receivedApp, options]); return appCheck; },
    getToken(receivedAppCheck) { calls.push(['getToken', receivedAppCheck]); return appCheckToken; },
    getLimitedUseToken(receivedAppCheck) { calls.push(['getLimitedUseToken', receivedAppCheck]); return limitedUseToken; },
    isSignInWithEmailLink(receivedAuth, href) { calls.push(['isSignInWithEmailLink', receivedAuth, href]); return emailLink; },
    signInWithEmailLink(receivedAuth, email, href) { calls.push(['signInWithEmailLink', receivedAuth, email, href]); receivedAuth.currentUser = signInResult?.user ?? null; return Promise.resolve(signInResult); },
  };
}

function createRuntime({ sdk = createSdk(), href = 'https://ballkingdom.com/order-status.html?sku=home-inspection-study-guide&mode=signIn&oobCode=one-time&continueUrl=https%3A%2F%2Fballkingdom.com', historyCalls = [], history = { replaceState(...args) { historyCalls.push(args); } } } = {}) {
  return {
    sdk,
    historyCalls,
    runtime: createFirebaseCommerceRuntime({
      location: { href },
      history,
      sdk,
      firebaseConfig: verifiedPublicConfig,
      recaptchaEnterpriseSiteKey: 'registered-public-site-key',
    }),
  };
}

async function assertGenericFailure(action) {
  await assert.rejects(action, genericError);
}

test('creates a frozen browser runtime with direct in-memory Auth initialization and App Check initialized once', async () => {
  const { runtime, sdk } = createRuntime();

  assert.equal(typeof runtime.getAppCheckToken, 'function');
  assert.equal(typeof runtime.getLimitedUseAppCheckToken, 'function');
  assert.equal(typeof runtime.getIdToken, 'function');
  assert.equal(typeof runtime.completeEmailLink, 'function');
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(sdk.calls.filter(([name]) => name === 'initializeApp').length, 1);
  assert.equal(sdk.calls.filter(([name]) => name === 'initializeAuth').length, 1);
  assert.equal(sdk.calls.find(([name]) => name === 'initializeAuth')[2].persistence, sdk.inMemoryPersistence);
  assert.equal(sdk.calls.filter(([name]) => name === 'getAuth').length, 0);
  assert.equal(sdk.calls.filter(([name]) => name === 'initializeAppCheck').length, 1);
  assert.deepEqual(sdk.calls.find(([name]) => name === 'initializeAppCheck')[2].isTokenAutoRefreshEnabled, true);
  assert.equal(await runtime.getAppCheckToken(), 'verified-app-check-token');
  assert.equal(await runtime.getLimitedUseAppCheckToken(), 'verified-limited-use-token');
  assert.equal(await runtime.getIdToken(), 'verified-id-token');
});

test('completes a valid email link and removes only action parameters after success', async () => {
  const historyCalls = [];
  const { runtime } = createRuntime({ historyCalls });

  assert.deepEqual(await runtime.completeEmailLink({ email: ' buyer@example.test ' }), { signedIn: true });
  assert.equal(historyCalls.length, 1);
  assert.doesNotMatch(historyCalls[0][2], /oobCode|mode=signIn|continueUrl/);
  assert.match(historyCalls[0][2], /sku=home-inspection-study-guide/);
});

test('rejects invalid or mismatched email links without changing browser history', async () => {
  const invalid = createRuntime({ sdk: createSdk({ emailLink: false }) });
  await assertGenericFailure(() => invalid.runtime.completeEmailLink({ email: 'buyer@example.test' }));
  assert.equal(invalid.historyCalls.length, 0);
  assert.equal(invalid.sdk.calls.filter(([name]) => name === 'signOut').length, 0);

  const mismatched = createRuntime({ sdk: createSdk({ signInResult: { user: { email: 'other@example.test' } } }) });
  await assertGenericFailure(() => mismatched.runtime.completeEmailLink({ email: 'buyer@example.test' }));
  assert.equal(mismatched.historyCalls.length, 0);
  assert.equal(mismatched.sdk.calls.filter(([name]) => name === 'signOut').length, 1);
  assert.equal(mismatched.sdk.calls.find(([name]) => name === 'signOut')[1].currentUser, null);
});

test('signs out and clears the current user when history cleanup fails after sign-in', async () => {
  const historyCalls = [];
  const { runtime, sdk } = createRuntime({ historyCalls, history: { replaceState(...args) { historyCalls.push(args); throw new Error('history failed'); } } });

  await assertGenericFailure(() => runtime.completeEmailLink({ email: 'buyer@example.test' }));
  assert.equal(historyCalls.length, 1);
  assert.equal(sdk.calls.filter(([name]) => name === 'signOut').length, 1);
  assert.equal(sdk.calls.find(([name]) => name === 'signOut')[1].currentUser, null);
});

test('rejects blank email addresses before calling the Firebase sign-in method', async () => {
  const { runtime, sdk, historyCalls } = createRuntime();

  await assertGenericFailure(() => runtime.completeEmailLink({ email: '   ' }));
  assert.equal(sdk.calls.filter(([name]) => name === 'signInWithEmailLink').length, 0);
  assert.equal(historyCalls.length, 0);
});

test('rejects absent users, empty App Check tokens, and malformed SDK results', async () => {
  const signedOut = createRuntime({ sdk: createSdk({ currentUser: null }) });
  await assertGenericFailure(() => signedOut.runtime.getIdToken());

  const emptyAppCheck = createRuntime({ sdk: createSdk({ appCheckToken: { token: '' } }) });
  await assertGenericFailure(() => emptyAppCheck.runtime.getAppCheckToken());

  const emptyLimitedUse = createRuntime({ sdk: createSdk({ limitedUseToken: { token: '' } }) });
  await assertGenericFailure(() => emptyLimitedUse.runtime.getLimitedUseAppCheckToken());

  const malformedEmailResult = createRuntime({ sdk: createSdk({ signInResult: { user: {} } }) });
  await assertGenericFailure(() => malformedEmailResult.runtime.completeEmailLink({ email: 'buyer@example.test' }));
});

test('uses direct in-memory Auth persistence with no default Auth or application-managed browser storage path', async () => {
  const { sdk } = createRuntime();
  const sources = await Promise.all(['firebase-commerce-runtime.js', 'commerce-client.js'].map(file =>
    readFile(new URL(`../assets/js/${file}`, import.meta.url), 'utf8')));
  for (const source of sources) assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB)\b/);
  assert.doesNotMatch(sources[0], /\bgetAuth\b|\bsetPersistence\b/);
  assert.equal(sdk.calls.filter(([name]) => name === 'initializeAuth').length, 1);
  assert.equal(sdk.calls.find(([name]) => name === 'initializeAuth')[2].persistence, sdk.inMemoryPersistence);
});

test('public browser boundary is a compatibility adapter rather than a pilot-labelled client contract', async () => {
  const client = await readFile(new URL('../assets/js/commerce-client.js', import.meta.url), 'utf8');
  assert.match(client, /requestPublicSignInLink/);
  assert.match(client, /realCallable\('requestPilotSignInLink',data\)/);
  assert.doesNotMatch(client, /requestPilotSignInLink\(request\)/);
});

test('client accepts only the authoritative public display contract from buyer capability', () => {
  const capability = validateCapabilityResponse({products:[{
    sku:'home-inspection-study-guide',active:true,
    display:{
      name:'Home Inspection Study Guide',amountCents:4900,currency:'USD',
      invoiceProvider:'quickbooks',paymentMethods:['card','apple_pay','paypal','venmo'],
      delivery:'protected_electronic_delivery',
    },
  }]});
  assert.equal(capability.products[0].display.amountCents, 4900);
  assert.throws(() => validateCapabilityResponse({products:[{
    sku:'home-inspection-study-guide',active:true,
    display:{
      name:'Home Inspection Study Guide',amountCents:4900,currency:'USD',
      invoiceProvider:'quickbooks',paymentMethods:['card','browser-supplied-method'],
      delivery:'protected_electronic_delivery',
    },
  }]}), /Invalid capability response/);
});

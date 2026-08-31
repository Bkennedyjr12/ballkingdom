import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirebaseCommerceRuntime } from '../assets/js/firebase-commerce-runtime.js';

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
  class ReCaptchaEnterpriseProvider {
    constructor(siteKey) { calls.push(['provider', siteKey]); }
  }
  return {
    calls,
    initializeApp(config) { calls.push(['initializeApp', config]); return app; },
    getAuth(receivedApp) { calls.push(['getAuth', receivedApp]); return auth; },
    ReCaptchaEnterpriseProvider,
    initializeAppCheck(receivedApp, options) { calls.push(['initializeAppCheck', receivedApp, options]); return appCheck; },
    getToken(receivedAppCheck) { calls.push(['getToken', receivedAppCheck]); return appCheckToken; },
    getLimitedUseToken(receivedAppCheck) { calls.push(['getLimitedUseToken', receivedAppCheck]); return limitedUseToken; },
    isSignInWithEmailLink(receivedAuth, href) { calls.push(['isSignInWithEmailLink', receivedAuth, href]); return emailLink; },
    signInWithEmailLink(receivedAuth, email, href) { calls.push(['signInWithEmailLink', receivedAuth, email, href]); return Promise.resolve(signInResult); },
  };
}

function createRuntime({ sdk = createSdk(), href = 'https://ballkingdom.com/order-status.html?sku=home-inspection-study-guide&mode=signIn&oobCode=one-time&continueUrl=https%3A%2F%2Fballkingdom.com', historyCalls = [] } = {}) {
  return {
    sdk,
    historyCalls,
    runtime: createFirebaseCommerceRuntime({
      location: { href },
      history: { replaceState(...args) { historyCalls.push(args); } },
      sdk,
      firebaseConfig: verifiedPublicConfig,
      recaptchaEnterpriseSiteKey: 'registered-public-site-key',
    }),
  };
}

async function assertGenericFailure(action) {
  await assert.rejects(action, genericError);
}

test('creates a frozen browser runtime with Firebase Auth and App Check initialized once', async () => {
  const { runtime, sdk } = createRuntime();

  assert.equal(typeof runtime.getAppCheckToken, 'function');
  assert.equal(typeof runtime.getLimitedUseAppCheckToken, 'function');
  assert.equal(typeof runtime.getIdToken, 'function');
  assert.equal(typeof runtime.completeEmailLink, 'function');
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(sdk.calls.filter(([name]) => name === 'initializeApp').length, 1);
  assert.equal(sdk.calls.filter(([name]) => name === 'getAuth').length, 1);
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

  const mismatched = createRuntime({ sdk: createSdk({ signInResult: { user: { email: 'other@example.test' } } }) });
  await assertGenericFailure(() => mismatched.runtime.completeEmailLink({ email: 'buyer@example.test' }));
  assert.equal(mismatched.historyCalls.length, 0);
});

test('rejects blank email addresses before calling the Firebase sign-in method', async () => {
  const { runtime, sdk, historyCalls } = createRuntime();

  await assertGenericFailure(() => runtime.completeEmailLink({ email: '   ' }));
  assert.equal(sdk.calls.filter(([name]) => name === 'signInWithEmailLink').length, 0);
  assert.equal(historyCalls.length, 0);
});

test('rejects absent users, empty App Check tokens, and malformed SDK results without storage writes', async () => {
  let writes = 0;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() { writes += 1; } } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { setItem() { writes += 1; } } });
  try {
    const signedOut = createRuntime({ sdk: createSdk({ currentUser: null }) });
    await assertGenericFailure(() => signedOut.runtime.getIdToken());

    const emptyAppCheck = createRuntime({ sdk: createSdk({ appCheckToken: { token: '' } }) });
    await assertGenericFailure(() => emptyAppCheck.runtime.getAppCheckToken());

    const emptyLimitedUse = createRuntime({ sdk: createSdk({ limitedUseToken: { token: '' } }) });
    await assertGenericFailure(() => emptyLimitedUse.runtime.getLimitedUseAppCheckToken());

    const malformedEmailResult = createRuntime({ sdk: createSdk({ signInResult: { user: {} } }) });
    await assertGenericFailure(() => malformedEmailResult.runtime.completeEmailLink({ email: 'buyer@example.test' }));
    assert.equal(writes, 0);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: originalSessionStorage });
  }
});

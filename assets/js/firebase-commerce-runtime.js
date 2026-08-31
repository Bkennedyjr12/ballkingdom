const FIREBASE_CONFIG = Object.freeze({
  projectId: 'the-ballers-kingdom',
  appId: '1:78885961453:web:9f7beee5425137768a96e4',
  storageBucket: 'the-ballers-kingdom.firebasestorage.app',
  apiKey: 'AIzaSyAaDpJxm-iOybCpsXio6cmW_JClPzq1lUw',
  authDomain: 'the-ballers-kingdom.firebaseapp.com',
  messagingSenderId: '78885961453',
  measurementId: 'G-DWTHYR5FR4',
});
const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LfY_GQtAAAAAHbwGeII_U4bf8YNWHUMu5OkoS2I';
const GENERIC_ERROR_MESSAGE = 'Unable to complete the secure identity check.';
const EMAIL_ACTION_PARAMETERS = Object.freeze(['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang', 'tenantId']);

function genericError() { return new Error(GENERIC_ERROR_MESSAGE); }
function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }

function readToken(response) {
  if (!response || typeof response !== 'object' || !isNonEmptyString(response.token)) throw genericError();
  return response.token;
}

function clearEmailActionParameters(location, history) {
  if (!location || !isNonEmptyString(location.href) || !history || typeof history.replaceState !== 'function') throw genericError();
  const url = new URL(location.href);
  for (const parameter of EMAIL_ACTION_PARAMETERS) url.searchParams.delete(parameter);
  history.replaceState(null, '', url.toString());
}

function validSdk(sdk) {
  return sdk && ['initializeApp', 'getAuth', 'ReCaptchaEnterpriseProvider', 'initializeAppCheck', 'getToken', 'getLimitedUseToken', 'isSignInWithEmailLink', 'signInWithEmailLink'].every(name => typeof sdk[name] === 'function');
}

function createFirebaseCommerceRuntime({ location, history, sdk, firebaseConfig, recaptchaEnterpriseSiteKey } = {}) {
  let auth;
  let appCheck;
  try {
    if (!validSdk(sdk) || !firebaseConfig || typeof firebaseConfig !== 'object' || !isNonEmptyString(recaptchaEnterpriseSiteKey)) throw genericError();
    const app = sdk.initializeApp(firebaseConfig);
    auth = sdk.getAuth(app);
    appCheck = sdk.initializeAppCheck(app, {
      provider: new sdk.ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    throw genericError();
  }

  return Object.freeze({
    async getAppCheckToken() {
      try { return readToken(await sdk.getToken(appCheck)); } catch { throw genericError(); }
    },
    async getLimitedUseAppCheckToken() {
      try { return readToken(await sdk.getLimitedUseToken(appCheck)); } catch { throw genericError(); }
    },
    async getIdToken() {
      try {
        const user = auth?.currentUser;
        if (!user || typeof user.getIdToken !== 'function') throw genericError();
        const token = await user.getIdToken(true);
        if (!isNonEmptyString(token)) throw genericError();
        return token;
      } catch { throw genericError(); }
    },
    async completeEmailLink({ email } = {}) {
      try {
        const normalizedEmail = typeof email === 'string' ? email.trim() : '';
        const href = location?.href;
        if (!isNonEmptyString(normalizedEmail) || !isNonEmptyString(href) || sdk.isSignInWithEmailLink(auth, href) !== true) throw genericError();
        const result = await sdk.signInWithEmailLink(auth, normalizedEmail, href);
        const signedInEmail = result?.user?.email;
        if (!isNonEmptyString(signedInEmail) || signedInEmail.trim().toLowerCase() !== normalizedEmail.toLowerCase()) throw genericError();
        clearEmailActionParameters(location, history);
        return Object.freeze({ signedIn: true });
      } catch { throw genericError(); }
    },
  });
}

async function installBrowserRuntime(targetWindow) {
  const [appModule, authModule, appCheckModule] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check.js'),
  ]);
  const runtime = createFirebaseCommerceRuntime({
    location: targetWindow.location,
    history: targetWindow.history,
    sdk: {
      initializeApp: appModule.initializeApp,
      getAuth: authModule.getAuth,
      ReCaptchaEnterpriseProvider: appCheckModule.ReCaptchaEnterpriseProvider,
      initializeAppCheck: appCheckModule.initializeAppCheck,
      getToken: appCheckModule.getToken,
      getLimitedUseToken: appCheckModule.getLimitedUseToken,
      isSignInWithEmailLink: authModule.isSignInWithEmailLink,
      signInWithEmailLink: authModule.signInWithEmailLink,
    },
    firebaseConfig: FIREBASE_CONFIG,
    recaptchaEnterpriseSiteKey: RECAPTCHA_ENTERPRISE_SITE_KEY,
  });
  Object.defineProperty(targetWindow, '__BALLERS_FIREBASE_RUNTIME__', {
    configurable: false,
    enumerable: false,
    value: runtime,
    writable: false,
  });
}

if (typeof window !== 'undefined' && window.document) await installBrowserRuntime(window);

export { createFirebaseCommerceRuntime };

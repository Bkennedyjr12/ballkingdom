import test from 'node:test';
import assert from 'node:assert/strict';

test('commerce boundary waits for the Firebase runtime-ready promise instead of failing closed permanently', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  let resolveRuntime;
  const ready = new Promise(resolve => { resolveRuntime = resolve; });
  globalThis.window = { __BALLERS_FIREBASE_RUNTIME_READY__: ready };
  try {
    const { getCommerceBoundary } = await import(`../assets/js/commerce-client.js?runtime-ready-test=${Date.now()}`);
    const boundaryPromise = getCommerceBoundary();
    let settled = false;
    boundaryPromise.finally(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);

    globalThis.window.__BALLERS_FIREBASE_RUNTIME__ = Object.freeze({
      getAppCheckToken: async () => 'app-check',
      getLimitedUseAppCheckToken: async () => 'limited-use-app-check',
      getIdToken: async () => 'id-token',
      completeEmailLink: async () => ({ signedIn: true }),
    });
    resolveRuntime(globalThis.window.__BALLERS_FIREBASE_RUNTIME__);
    const boundary = await boundaryPromise;
    assert.equal(typeof boundary?.getBuyerCommerceCapability, 'function');
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

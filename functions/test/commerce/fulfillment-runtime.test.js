import test from 'node:test';
import assert from 'node:assert/strict';
import {readFulfillmentRuntimeReadiness, createFulfillmentRuntime, readPlannedArtifactDefinitions} from '../../src/commerce/fulfillment-runtime.js';

test('runtime remains false while the verified artifact is not wired to download endpoints', () => {
  assert.deepEqual(readFulfillmentRuntimeReadiness(), {
    ready:false,verifiedBucket:'the-ballers-kingdom.firebasestorage.app',activeArtifactCount:0,
    blocker:'fulfillment_runtime_unwired',
  });
  assert.throws(() => createFulfillmentRuntime(), /not ready/i);
});

test('records the reviewed artifact definition but does not make fulfillment ready', () => {
  const planned = readPlannedArtifactDefinitions();
  assert.deepEqual(planned['home-inspection-study-guide'], {
    key:'private-commerce/home-inspection-study-guide/guide-v1.pdf',
    contentType:'application/pdf',
    exactBytes:71250419,
    sha256:'2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d',
    md5Hash:'XXzfi6ddgB6rru9fLIrv7Q==',
    generation:'1788191152627469',
    verified:true,
  });
  assert.equal(readFulfillmentRuntimeReadiness().ready, false);
  assert.throws(() => createFulfillmentRuntime(), /not ready/i);
});

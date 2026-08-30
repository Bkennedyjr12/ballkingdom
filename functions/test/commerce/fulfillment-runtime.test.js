import test from 'node:test';
import assert from 'node:assert/strict';
import {readFulfillmentRuntimeReadiness, createFulfillmentRuntime, readPlannedArtifactDefinitions} from '../../src/commerce/fulfillment-runtime.js';

test('runtime remains false with no active artifact while inventory proves the SKU object absent', () => {
  assert.deepEqual(readFulfillmentRuntimeReadiness(), {
    ready:false,verifiedBucket:'the-ballers-kingdom.firebasestorage.app',activeArtifactCount:0,
    blocker:'paid_artifact_absent',
  });
  assert.throws(() => createFulfillmentRuntime(), /not ready/i);
});

test('records the reviewed artifact definition but does not make fulfillment ready', () => {
  const planned = readPlannedArtifactDefinitions();
  assert.deepEqual(planned['home-inspection-study-guide'], {
    key:'private-commerce/home-inspection-study-guide/guide-v1.pdf',
    contentType:'application/pdf',
    maxBytes:71250419,
    sha256:'2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d',
    verified:false,
  });
  assert.equal(readFulfillmentRuntimeReadiness().ready, false);
  assert.throws(() => createFulfillmentRuntime(), /not ready/i);
});

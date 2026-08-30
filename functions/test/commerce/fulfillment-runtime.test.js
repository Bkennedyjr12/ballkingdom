import test from 'node:test';
import assert from 'node:assert/strict';
import {readFulfillmentRuntimeReadiness, createFulfillmentRuntime} from '../../src/commerce/fulfillment-runtime.js';

test('runtime remains false with no active artifact while inventory proves the SKU object absent', () => {
  assert.deepEqual(readFulfillmentRuntimeReadiness(), {
    ready:false,verifiedBucket:'the-ballers-kingdom.firebasestorage.app',activeArtifactCount:0,
    blocker:'paid_artifact_absent',
  });
  assert.throws(() => createFulfillmentRuntime(), /not ready/i);
});

import {VERIFIED_COMMERCE_BUCKET} from './private-artifact-stream.js';

const READINESS = Object.freeze({
  ready:false,
  verifiedBucket:VERIFIED_COMMERCE_BUCKET,
  activeArtifactCount:0,
  blocker:'paid_artifact_absent',
});

export function readFulfillmentRuntimeReadiness() {
  return READINESS;
}

export function createFulfillmentRuntime() {
  const error = new Error('Protected fulfillment runtime is not ready');
  error.code = 'FULFILLMENT_RUNTIME_NOT_READY';
  throw error;
}

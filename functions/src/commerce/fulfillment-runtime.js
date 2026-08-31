import {VERIFIED_COMMERCE_BUCKET} from './private-artifact-stream.js';
import {getConfiguredCommerceItem} from './catalog.js';

const configuredGuide = getConfiguredCommerceItem('home-inspection-study-guide');
const PLANNED_ARTIFACTS = Object.freeze({
  'home-inspection-study-guide':Object.freeze({
    key:configuredGuide.artifact.objectKey,
    contentType:configuredGuide.artifact.contentType,
    exactBytes:configuredGuide.artifact.exactBytes,
    sha256:configuredGuide.artifact.sha256,
    md5Hash:configuredGuide.artifact.md5Hash,
    generation:configuredGuide.artifact.generation,
    verified:configuredGuide.artifact.objectVerified,
  }),
});

const READINESS = Object.freeze({
  ready:false,
  verifiedBucket:VERIFIED_COMMERCE_BUCKET,
  activeArtifactCount:0,
  blocker:'paid_artifact_absent',
});

export function readFulfillmentRuntimeReadiness() {
  return READINESS;
}

export function readPlannedArtifactDefinitions() {
  return PLANNED_ARTIFACTS;
}

export function createFulfillmentRuntime() {
  const error = new Error('Protected fulfillment runtime is not ready');
  error.code = 'FULFILLMENT_RUNTIME_NOT_READY';
  throw error;
}

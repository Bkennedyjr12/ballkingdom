import {createFulfillmentRepository} from './fulfillment-repository.js';
import {createFulfillmentService} from './fulfillment.js';
import {
  createPrivateArtifactStreamer,
  VERIFIED_COMMERCE_BUCKET,
} from './private-artifact-stream.js';
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
  ready:true,
  verifiedBucket:VERIFIED_COMMERCE_BUCKET,
  activeArtifactCount:1,
  blocker:null,
});

export function readFulfillmentRuntimeReadiness() {
  return READINESS;
}

export function readPlannedArtifactDefinitions() {
  return PLANNED_ARTIFACTS;
}

export function createFulfillmentRuntime({db,fieldValue,Timestamp,bucket} = {}) {
  if (!bucket?.file || bucket.name !== VERIFIED_COMMERCE_BUCKET) {
    throw new TypeError('Verified commerce bucket is required');
  }
  const repository = createFulfillmentRepository({db,fieldValue,Timestamp});
  const streamArtifact = createPrivateArtifactStreamer({bucket});
  return createFulfillmentService({
    repository,
    artifactKeys:PLANNED_ARTIFACTS,
    streamArtifact,
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFulfillmentRuntime,
  readFulfillmentRuntimeReadiness,
  readPlannedArtifactDefinitions,
} from '../../src/commerce/fulfillment-runtime.js';

const Timestamp = {fromDate:date => new Date(date)};
const fieldValue = {serverTimestamp:() => ({serverTimestamp:true})};

function dependencies(bucketName = 'the-ballers-kingdom.firebasestorage.app') {
  const db = {
    collection() {
      return {doc() { return {get:async () => ({exists:false})}; }};
    },
    runTransaction:async callback => callback({}),
  };
  const bucket = {name:bucketName,file() { return {}; }};
  return {db,fieldValue,Timestamp,bucket};
}

test('rejects missing dependencies and every unverified bucket identity', () => {
  for (const missing of [
    undefined,
    {},
    {...dependencies(),db:null},
    {...dependencies(),fieldValue:null},
    {...dependencies(),Timestamp:null},
    {...dependencies(),bucket:null},
  ]) assert.throws(() => createFulfillmentRuntime(missing), TypeError);

  for (const bucketName of [
    '',
    'the-ballers-kingdom.appspot.com',
    'attacker.firebasestorage.app',
  ]) {
    assert.throws(
      () => createFulfillmentRuntime(dependencies(bucketName)),
      /verified commerce bucket/i,
    );
  }
});

test('composes the existing fulfillment service only for the verified bucket', () => {
  const service = createFulfillmentRuntime(dependencies());
  assert.equal(typeof service.fulfillPaidOrder, 'function');
  assert.equal(typeof service.createDownloadGrant, 'function');
  assert.equal(typeof service.redeemDownloadGrant, 'function');
  assert.equal(Object.isFrozen(service), true);
});

test('uses one frozen generation-pinned server artifact allowlist', () => {
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
  assert.equal(Object.isFrozen(planned), true);
  assert.equal(Object.isFrozen(planned['home-inspection-study-guide']), true);
  assert.throws(() => {
    planned['home-inspection-study-guide'].generation = '1';
  }, TypeError);
});

test('reports the verified production composition as immutable and ready', () => {
  const readiness = readFulfillmentRuntimeReadiness();
  assert.deepEqual(readiness, {
    ready:true,
    verifiedBucket:'the-ballers-kingdom.firebasestorage.app',
    activeArtifactCount:1,
    blocker:null,
  });
  assert.equal(Object.isFrozen(readiness), true);
});

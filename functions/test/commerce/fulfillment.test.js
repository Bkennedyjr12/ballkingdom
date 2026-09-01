import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFulfillmentService} from '../../src/commerce/fulfillment.js';

const NOW = new Date('2026-08-30T12:00:00.000Z');
const SKU = 'home-inspection-study-guide';
const ARTIFACT = 'private-commerce/home-inspection-study-guide.pdf';
const ARTIFACT_CONFIG = Object.freeze({
  key:ARTIFACT,contentType:'application/pdf',exactBytes:100,
  generation:'1785951381246665',md5Hash:'XXzfi6ddgB6rru9fLIrv7Q==',
  sha256:'2bdf6b760b426cc088ade620334fd8ff735f3276bb0b68589ceaccbc1d93cc9d',
});

function fixture({status = 'fulfilled', uid = 'customer-1'} = {}) {
  const orders = new Map([['order-1', {
    id:'order-1',status,orderType:'digital_product',fulfillmentType:'protected_download',
    sku:SKU,customerUid:uid,
  }]]);
  const entitlements = new Map([['order-1', {
    orderId:'order-1',status:'active',sku:SKU,customerUid:uid,
  }]]);
  const grants = new Map();
  const persisted = [];
  let randomCounter = 0;
  const repository = {
    getOrder:async id => orders.get(id) ?? null,
    getEntitlement:async id => entitlements.get(id) ?? null,
    activateEntitlement:async entitlement => {
      entitlements.set(entitlement.orderId, structuredClone(entitlement));
      return entitlement;
    },
    createDownloadGrant:async grant => {
      persisted.push(structuredClone(grant));
      grants.set(`${grant.orderId}:${grant.digest}`, structuredClone(grant));
    },
    consumeDownloadGrant:async ({orderId,digest,customerUid,sku,now}) => {
      const key = `${orderId}:${digest}`;
      const grant = grants.get(key);
      if (!grant || grant.customerUid !== customerUid || grant.sku !== sku
        || grant.consumedAt || now.getTime() >= grant.expiresAt.getTime()) return null;
      grant.consumedAt = new Date(now);
      return structuredClone(grant);
    },
  };
  const opened = [];
  const service = createFulfillmentService({
    repository,
    artifactKeys:{[SKU]:ARTIFACT_CONFIG},
    randomBytes:() => Buffer.alloc(32, ++randomCounter),
    clock:() => new Date(NOW),
    streamArtifact:async key => {
      opened.push(key);
      return {streamed:true,contentType:'application/pdf',bytesWritten:100};
    },
  });
  return {service,orders,entitlements,grants,persisted,opened};
}

const auth = (uid = 'customer-1') => ({app:{appId:'test-app'},auth:{uid}});

test('requires App Check and the authenticated owner and ignores a client UID', async () => {
  const {service} = fixture();
  await assert.rejects(service.createDownloadGrant({orderId:'order-1'}, {auth:{uid:'customer-1'}}), /App Check/);
  await assert.rejects(service.createDownloadGrant({orderId:'order-1'}, auth('wrong-user')), /not found/i);
  await assert.rejects(
    service.createDownloadGrant({orderId:'order-1',customerUid:'customer-1'}, auth('wrong-user')),
    /not found/i,
  );
  await assert.rejects(
    service.createDownloadGrant(
      {orderId:'order-1'},
      {app:{appId:'test-app'},auth:{uid:'admin',token:{admin:true}}},
    ),
    /not found/i,
  );
});

test('derives identity only from auth.uid and rejects a spoofed top-level owner UID', async () => {
  const {service} = fixture();
  await assert.rejects(service.createDownloadGrant(
    {orderId:'order-1'},
    {app:{appId:'test-app'},uid:'customer-1',auth:{uid:'attacker'}},
  ), /not found/i);
  await assert.rejects(service.createDownloadGrant(
    {orderId:'order-1'},
    {app:{appId:'test-app'},uid:'customer-1'},
  ), /Authentication is required/);
});

test('accepts bounded Firebase custom UIDs and rejects controls or oversize authentication UIDs', async () => {
  const customUid = 'custom:uid@example.com|tenant/abc';
  const {service} = fixture({uid:customUid});
  assert.match((await service.createDownloadGrant({orderId:'order-1'}, auth(customUid))).grant, /^[A-Za-z0-9_-]{43}$/);
  for (const invalidUid of [`owner\nadmin`,'x'.repeat(129)]) {
    await assert.rejects(
      service.createDownloadGrant({orderId:'order-1'}, auth(invalidUid)),
      /Authentication is required/,
    );
  }
});

test('denies every unpaid, partial, cancelled, refunded, or unverified state and guessed handles', async () => {
  for (const status of [
    'draft','invoice_created','invoice_sent','pending_payment','partially_paid','paid','webhook_hint',
    'cancelled','refunded','manual_review',
  ]) {
    const {service} = fixture({status});
    await assert.rejects(service.createDownloadGrant({orderId:'order-1'}, auth()), /not available/i, status);
  }
  const {service} = fixture();
  await assert.rejects(service.createDownloadGrant({orderId:'guessed-order'}, auth()), /not found/i);
});

test('persists only a 256-bit nonce digest bound to order, owner, and SKU for ten minutes', async () => {
  const {service,persisted} = fixture();
  const result = await service.createDownloadGrant({orderId:'order-1'}, auth());
  assert.match(result.grant, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(result.grant, 'base64url').byteLength, 32);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].digest, createHash('sha256').update(result.grant).digest('hex'));
  assert.equal(JSON.stringify(persisted[0]).includes(result.grant), false);
  assert.deepEqual({
    orderId:persisted[0].orderId,customerUid:persisted[0].customerUid,sku:persisted[0].sku,
    issuedAt:persisted[0].issuedAt,expiresAt:persisted[0].expiresAt,consumedAt:persisted[0].consumedAt,
  }, {
    orderId:'order-1',customerUid:'customer-1',sku:SKU,issuedAt:NOW,
    expiresAt:new Date(NOW.getTime() + 10 * 60 * 1000),consumedAt:null,
  });
});

test('atomically permits exactly one concurrent redemption and rejects replay', async () => {
  const {service,opened} = fixture();
  const {grant} = await service.createDownloadGrant({orderId:'order-1'}, auth());
  const settled = await Promise.allSettled([
    service.redeemDownloadGrant({orderId:'order-1',grant}, auth()),
    service.redeemDownloadGrant({orderId:'order-1',grant}, auth()),
  ]);
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(result => result.status === 'rejected').length, 1);
  assert.equal(opened.length, 1);
  await assert.rejects(service.redeemDownloadGrant({orderId:'order-1',grant}, auth()), /invalid or expired/i);
});

test('rejects modified, wrong-order, wrong-SKU, wrong-owner, and boundary-expired grants', async () => {
  const state = fixture();
  const {grant} = await state.service.createDownloadGrant({orderId:'order-1'}, auth());
  await assert.rejects(state.service.redeemDownloadGrant({orderId:'order-1',grant:`${grant.slice(0,-1)}A`}, auth()), /invalid/i);
  await assert.rejects(state.service.redeemDownloadGrant({orderId:'order-2',grant}, auth()), /not found/i);
  await assert.rejects(state.service.redeemDownloadGrant({orderId:'order-1',grant}, auth('wrong')), /not found/i);

  state.orders.get('order-1').sku = 'another-sku';
  await assert.rejects(state.service.redeemDownloadGrant({orderId:'order-1',grant}, auth()), /not available/i);

  const expired = fixture();
  const issued = await expired.service.createDownloadGrant({orderId:'order-1'}, auth());
  const boundaryService = createFulfillmentService({
    repository:{
      getOrder:async id => expired.orders.get(id) ?? null,
      getEntitlement:async id => expired.entitlements.get(id) ?? null,
      createDownloadGrant:async () => {},
      consumeDownloadGrant:async ({orderId,digest,customerUid,sku}) => {
        const saved = expired.grants.get(`${orderId}:${digest}`);
        if (!saved || saved.customerUid !== customerUid || saved.sku !== sku
          || new Date(NOW.getTime()+600000).getTime() >= saved.expiresAt.getTime()) return null;
        return saved;
      },
    },artifactKeys:{[SKU]:ARTIFACT_CONFIG},clock:() => new Date(NOW.getTime()+600000),
    streamArtifact:async () => ({streamed:true,contentType:'application/pdf',bytesWritten:100}),
  });
  await assert.rejects(boundaryService.redeemDownloadGrant({orderId:'order-1',grant:issued.grant}, auth()), /invalid or expired/i);
});

test('rejects path traversal and never accepts a browser storage key', async () => {
  const {service} = fixture();
  await assert.rejects(service.createDownloadGrant({orderId:'../order-1'}, auth()), /invalid/i);
  await assert.rejects(
    service.redeemDownloadGrant({orderId:'order-1',grant:'../secret',storagePath:'public/file'}, auth()),
    /invalid/i,
  );
});

test('a consumed streaming failure remains consumed while a new authenticated grant can retry', async () => {
  const state = fixture();
  let fail = true;
  const service = createFulfillmentService({
    repository:{
      getOrder:async id => state.orders.get(id) ?? null,
      getEntitlement:async id => state.entitlements.get(id) ?? null,
      createDownloadGrant:async grant => state.grants.set(`${grant.orderId}:${grant.digest}`, structuredClone(grant)),
      consumeDownloadGrant:async ({orderId,digest,customerUid,sku,now}) => {
        const saved = state.grants.get(`${orderId}:${digest}`);
        if (!saved || saved.consumedAt || saved.customerUid !== customerUid || saved.sku !== sku
          || now >= saved.expiresAt) return null;
        saved.consumedAt = now;
        return saved;
      },
    },artifactKeys:{[SKU]:ARTIFACT_CONFIG},randomBytes:() => Buffer.alloc(32, state.grants.size + 10),
    clock:() => new Date(NOW),streamArtifact:async () => {
      if (fail) { fail = false; throw new Error('stream failed'); }
      return {streamed:true,contentType:'application/pdf',bytesWritten:100};
    },
  });
  const first = await service.createDownloadGrant({orderId:'order-1'}, auth());
  await assert.rejects(service.redeemDownloadGrant({orderId:'order-1',grant:first.grant}, auth()), /stream failed/);
  await assert.rejects(service.redeemDownloadGrant({orderId:'order-1',grant:first.grant}, auth()), /invalid or expired/i);
  const second = await service.createDownloadGrant({orderId:'order-1'}, auth());
  assert.equal((await service.redeemDownloadGrant({orderId:'order-1',grant:second.grant}, auth())).streamed, true);
});

test('rejects reusable URL-shaped artifact delivery results', async () => {
  for (const unsafe of [
    {streamed:true,url:'https://storage.example.test/file'},
    {streamed:true,providerUrl:'https://storage.example.test/file'},
    {streamed:true,signedUrl:'https://storage.example.test/file'},
    {streamed:true,body:'private bytes'},
    {streamed:false,body:'bytes'},
  ]) {
    const state = fixture();
    const service = createFulfillmentService({
      repository:{
        getOrder:async id => state.orders.get(id) ?? null,
        getEntitlement:async id => state.entitlements.get(id) ?? null,
        createDownloadGrant:async grant => state.grants.set(`${grant.orderId}:${grant.digest}`, structuredClone(grant)),
        consumeDownloadGrant:async ({orderId,digest}) => {
          const saved = state.grants.get(`${orderId}:${digest}`);
          if (!saved || saved.consumedAt) return null;
          saved.consumedAt = NOW;
          return saved;
        },
      },
      artifactKeys:{[SKU]:ARTIFACT_CONFIG},randomBytes:() => Buffer.alloc(32, 7),clock:() => new Date(NOW),
      streamArtifact:async () => unsafe,
    });
    const {grant} = await service.createDownloadGrant({orderId:'order-1'}, auth());
    await assert.rejects(
      service.redeemDownloadGrant({orderId:'order-1',grant}, auth()),
      /streaming contract/i,
    );
  }
});

test('bounds stream MIME and byte metadata to the server SKU definition', async () => {
  const cases = [
    [{streamed:true,contentType:'text/html',bytesWritten:100}, false],
    [{streamed:true,contentType:'application/pdf; charset=utf-8',bytesWritten:100}, false],
    [{streamed:true,contentType:`application/${'x'.repeat(200)}`,bytesWritten:100}, false],
    [{streamed:true,contentType:'application/pdf\nX-Evil: yes',bytesWritten:100}, false],
    [{streamed:true,contentType:'application/pdf',bytesWritten:101}, false],
    [{streamed:true,contentType:'application/pdf',bytesWritten:100,unknown:true}, false],
    [{streamed:true,contentType:'application/pdf',bytesWritten:100}, true],
  ];
  for (const [receipt, valid] of cases) {
    const state = fixture();
    const service = createFulfillmentService({
      repository:{
        getOrder:async id => state.orders.get(id) ?? null,
        getEntitlement:async id => state.entitlements.get(id) ?? null,
        createDownloadGrant:async grant => state.grants.set(`${grant.orderId}:${grant.digest}`, structuredClone(grant)),
        consumeDownloadGrant:async ({orderId,digest}) => {
          const saved = state.grants.get(`${orderId}:${digest}`);
          if (!saved || saved.consumedAt) return null;
          saved.consumedAt = NOW;
          return saved;
        },
      },artifactKeys:{[SKU]:ARTIFACT_CONFIG},randomBytes:() => Buffer.alloc(32, 8),
      clock:() => new Date(NOW),streamArtifact:async () => receipt,
    });
    const {grant} = await service.createDownloadGrant({orderId:'order-1'}, auth());
    const redemption = service.redeemDownloadGrant({orderId:'order-1',grant}, auth());
    if (valid) assert.deepEqual(await redemption, receipt);
    else await assert.rejects(redemption, /streaming contract/i);
  }
});

test('passes only the immutable server artifact fingerprint to the stream adapter', async () => {
  const state = fixture();
  let observed;
  const service = createFulfillmentService({
    repository:{
      getOrder:async id => state.orders.get(id) ?? null,
      getEntitlement:async id => state.entitlements.get(id) ?? null,
      createDownloadGrant:async grant => state.grants.set(`${grant.orderId}:${grant.digest}`, structuredClone(grant)),
      consumeDownloadGrant:async ({orderId,digest}) => state.grants.get(`${orderId}:${digest}`),
    },
    artifactKeys:{[SKU]:ARTIFACT_CONFIG},randomBytes:() => Buffer.alloc(32, 9),clock:() => new Date(NOW),
    streamArtifact:async (key, context) => {
      observed={key,...context};
      return {streamed:true,contentType:'application/pdf',bytesWritten:100};
    },
  });
  const {grant}=await service.createDownloadGrant({orderId:'order-1'},auth());
  await service.redeemDownloadGrant({orderId:'order-1',grant},auth());
  assert.equal(observed.key, ARTIFACT);
  assert.equal(observed.exactBytes, 100);
  assert.equal(observed.expectedGeneration, '1785951381246665');
  assert.equal(observed.expectedMd5Hash, 'XXzfi6ddgB6rru9fLIrv7Q==');
  assert.equal(Object.hasOwn(observed,'maxBytes'), false);
});

test('fulfillPaidOrder permits only a paid protected digital order with an allowlisted SKU', async () => {
  const {service,entitlements} = fixture({status:'paid'});
  const result = await service.fulfillPaidOrder({
    id:'order-1',status:'paid',orderType:'digital_product',fulfillmentType:'protected_download',
    sku:SKU,customerUid:'customer-1',
  });
  assert.equal(result.status, 'active');
  assert.equal(entitlements.get('order-1').sku, SKU);
  await assert.rejects(service.fulfillPaidOrder({...result,status:'invoice_sent'}), /not eligible/i);
});

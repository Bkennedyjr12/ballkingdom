import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDownloadHttpHandler} from '../../src/commerce/download-http.js';

const ORIGIN = 'https://ballkingdom.com';
const HOSTING_ORIGIN = 'https://ballkingdom-com.web.app';
const ID_TOKEN = 'id-token-private';
const APP_TOKEN = 'app-check-private';
const GRANT = 'A'.repeat(43);

function request(overrides = {}) {
  const body = overrides.body ?? {orderHandle:'order-1',grant:GRANT};
  const result={
    method:'POST',
    headers:{
      origin:ORIGIN,
      'content-type':'application/json',
      authorization:`Bearer ${ID_TOKEN}`,
      'x-firebase-appcheck':APP_TOKEN,
      ...overrides.headers,
    },
    body,
    rawBody:overrides.rawBody ?? Buffer.from(JSON.stringify(body)),
    ...Object.fromEntries(Object.entries(overrides).filter(([key])=>key!=='headers')),
  };
  result.headers={...result.headers,...overrides.headers};
  return result;
}

class Response extends EventEmitter {
  constructor() { super(); this.headers={}; this.statusCode=200; this.body=''; this.destroyed=false; }
  setHeader(key,value) { this.headers[String(key).toLowerCase()]=String(value); }
  status(value) { this.statusCode=value; return this; }
  send(value='') { this.body=String(value); this.emit('finish'); return this; }
  end(value='') { this.body+=String(value); this.emit('finish'); return this; }
  destroy() { this.destroyed=true; }
}

function fixture(overrides = {}) {
  const calls=[];
  const auth=overrides.auth ?? {
    async verifyIdToken(token,checkRevoked) {
      calls.push(['verifyIdToken',token,checkRevoked]);
      return {uid:'buyer-1'};
    },
    async getUser(uid) {
      calls.push(['getUser',uid]);
      return {uid,disabled:false,emailVerified:true};
    },
  };
  const appCheck=overrides.appCheck ?? {
    async verifyToken(token,options) {
      calls.push(['verifyAppCheck',token,options]);
      return {appId:'app-1',alreadyConsumed:false};
    },
  };
  const fulfillment=overrides.fulfillment ?? {
    async redeemDownloadGrant(input,context) {
      calls.push(['redeem',input,{auth:context.auth,app:context.app}]);
      context.response.setHeader('Content-Type','application/pdf');
      context.response.end('%PDF');
      return {streamed:true,contentType:'application/pdf',bytesWritten:4};
    },
  };
  return {
    calls,
    handler:createDownloadHttpHandler({auth,appCheck,fulfillment}),
  };
}

async function invoke(state,req=request()) {
  const response=new Response();
  await state.handler(req,response);
  return response;
}

test('permits exact-origin preflight for only the protected POST headers', async () => {
  const state=fixture();
  const response=await invoke(state,request({
    method:'OPTIONS',body:undefined,rawBody:Buffer.alloc(0),
    headers:{origin:HOSTING_ORIGIN,'access-control-request-method':'POST',
      'access-control-request-headers':'authorization, content-type, x-firebase-appcheck'},
  }));
  assert.equal(response.statusCode,204);
  assert.equal(response.headers['access-control-allow-origin'],HOSTING_ORIGIN);
  assert.equal(response.headers['access-control-allow-methods'],'POST');
  assert.equal(response.headers['access-control-allow-headers'],
    'Authorization, Content-Type, X-Firebase-AppCheck');
  assert.equal(response.headers.vary,'Origin');
  assert.equal(response.headers['access-control-allow-credentials'],undefined);
  assert.deepEqual(state.calls,[]);
});

test('rejects unknown origins, methods, and expanded preflight headers', async () => {
  for (const req of [
    request({headers:{origin:'https://attacker.example'}}),
    request({method:'GET'}),
    request({method:'OPTIONS',rawBody:Buffer.alloc(0),headers:{
      origin:ORIGIN,'access-control-request-method':'POST',
      'access-control-request-headers':'authorization, cookie',
    }}),
  ]) {
    const state=fixture();
    const response=await invoke(state,req);
    assert.equal(response.statusCode,403);
    assert.equal(response.headers['access-control-allow-origin'],undefined);
    assert.deepEqual(state.calls,[]);
  }
});

test('requires a bounded exact JSON object with only orderHandle and grant', async () => {
  const badRequests=[
    request({headers:{'content-type':'text/plain'}}),
    request({body:[],rawBody:Buffer.from('[]')}),
    request({body:{orderHandle:'order-1',grant:GRANT,storagePath:'private/file'}}),
    request({rawBody:Buffer.alloc(16 * 1024 + 1,65)}),
    request({rawBody:undefined}),
  ];
  for (const req of badRequests) {
    const state=fixture();
    const response=await invoke(state,req);
    assert.equal(response.statusCode,400);
    assert.equal(response.body,'Invalid request');
    assert.deepEqual(state.calls,[]);
  }
});

test('requires a single strict Bearer token and performs revocation plus authoritative-user checks', async () => {
  for (const authorization of [undefined,'Basic abc','Bearer','Bearer one two','bearer abc']) {
    const state=fixture();
    const response=await invoke(state,request({headers:{authorization}}));
    assert.equal(response.statusCode,401);
    assert.equal(response.body,'Unauthorized');
  }
  const state=fixture();
  const response=await invoke(state);
  assert.deepEqual(state.calls.slice(0,2),[
    ['verifyIdToken',ID_TOKEN,true],
    ['getUser','buyer-1'],
  ]);
  assert.equal(response.statusCode,200);
});

test('rejects revoked, disabled, deleted, stale, and unverified users generically', async () => {
  const cases=[
    {async verifyIdToken(){throw new Error(`revoked ${ID_TOKEN}`);},async getUser(){}},
    {async verifyIdToken(){return {uid:'buyer-1'};},async getUser(){throw new Error('deleted user');}},
    {async verifyIdToken(){return {uid:'buyer-1'};},async getUser(){return {uid:'buyer-1',disabled:true,emailVerified:true};}},
    {async verifyIdToken(){return {uid:'buyer-1'};},async getUser(){return {uid:'other',disabled:false,emailVerified:true};}},
    {async verifyIdToken(){return {uid:'buyer-1'};},async getUser(){return {uid:'buyer-1',disabled:false,emailVerified:false};}},
  ];
  for (const auth of cases) {
    const response=await invoke(fixture({auth}));
    assert.equal(response.statusCode,401);
    assert.equal(response.body,'Unauthorized');
    assert.doesNotMatch(response.body,/revoked|deleted|token|buyer/i);
  }
});

test('consumes the limited-use App Check token and rejects invalid or replayed tokens', async () => {
  const calls=[];
  const valid={async verifyToken(token,options){calls.push([token,options]);return {appId:'app-1',alreadyConsumed:false};}};
  assert.equal((await invoke(fixture({appCheck:valid}))).statusCode,200);
  assert.deepEqual(calls,[[APP_TOKEN,{consume:true}]]);

  for (const appCheck of [
    {async verifyToken(){throw new Error(`provider leaked ${APP_TOKEN}`);}},
    {async verifyToken(){return {appId:'app-1',alreadyConsumed:true};}},
    {async verifyToken(){return {alreadyConsumed:false};}},
  ]) {
    const response=await invoke(fixture({appCheck}));
    assert.equal(response.statusCode,403);
    assert.equal(response.body,'Forbidden');
    assert.doesNotMatch(response.body,/provider|token|app-1/i);
  }
});

test('passes only normalized identity, consumed App Check context, and response to fulfillment', async () => {
  const state=fixture();
  await invoke(state);
  const redemption=state.calls.find(call=>call[0]==='redeem');
  assert.deepEqual(redemption,[
    'redeem',
    {orderId:'order-1',grant:GRANT},
    {auth:{uid:'buyer-1'},app:{appId:'app-1'}},
  ]);
});

test('maps all fulfillment denials to a generic 404 without provider details or tokens', async () => {
  for (const code of ['FULFILLMENT_NOT_FOUND','FULFILLMENT_NOT_AVAILABLE',
    'FULFILLMENT_GRANT_INVALID','FULFILLMENT_INPUT_INVALID','UNEXPECTED_PROVIDER_ERROR']) {
    const fulfillment={async redeemDownloadGrant(){
      throw Object.assign(new Error(`private ${ID_TOKEN} ${APP_TOKEN}`),{code,provider:{secret:'value'}});
    }};
    const response=await invoke(fixture({fulfillment}));
    assert.equal(response.statusCode,404);
    assert.equal(response.body,'Not found');
    assert.doesNotMatch(response.body,/private|token|secret|FULFILLMENT/i);
  }
});

test('sets safe download headers only when authorized fulfillment starts streaming', async () => {
  let headersBeforeStream;
  const fulfillment={async redeemDownloadGrant(_input,context){
    headersBeforeStream={...context.response.headers};
    context.response.setHeader('Content-Type','application/pdf');
    context.response.end('%PDF');
    return {streamed:true,contentType:'application/pdf',bytesWritten:4};
  }};
  const response=await invoke(fixture({fulfillment}));
  assert.deepEqual(headersBeforeStream,{
    'access-control-allow-origin':ORIGIN,
    vary:'Origin',
  });
  assert.equal(response.statusCode,200);
  assert.equal(response.headers['content-type'],'application/pdf');
  assert.equal(response.headers['content-disposition'],
    'attachment; filename="Home Inspection Study Guide.pdf"');
  assert.equal(response.headers['cache-control'],'private, no-store, max-age=0');
  assert.equal(response.headers['x-content-type-options'],'nosniff');
  assert.equal(response.headers['access-control-allow-origin'],ORIGIN);
  assert.equal(response.headers['access-control-allow-credentials'],undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApliiqClient, verifyApliiqWebhook } from '../src/apparel/apliiq.js';

const key = 'fixture-key', secret = 'fixture-secret';
const order = () => ({id:'store-1',number:1,name:'#1',order_number:1,line_items:[{id:'line-1',title:'Fictional tee',quantity:1,price:'19.00',sku:'APQ-123S7A1'}],shipping_address:{first_name:'Example',last_name:'Buyer',address1:'Example address',city:'Example city',zip:'00000',province:'Example',province_code:'CA',country:'United States',country_code:'US'}});
const client = fetchImpl => createApliiqClient({fetchImpl,key,secret,now:()=>1700000000000,nonce:()=> 'fixture-nonce'});
const response = (status,body) => new Response(JSON.stringify(body),{status});

test('POST signs exact serialized bytes and accepts only processed 200 with valid id', async()=>{
 let calls=0;
 const api=client(async(url,options)=>{
  calls++; assert.equal(url,'https://api.apliiq.com/v1/Order');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  const expected=createHmac('sha256',secret).update(key+'1700000000fixture-nonce'+Buffer.from(options.body).toString('base64')).digest('base64');
  assert.equal(options.headers.Authorization,`x-apliiq-auth 1700000000:${expected}:${key}:fixture-nonce`);
  assert.equal(options.headers['Content-Type'],'application/json'); assert.equal(options.body,JSON.stringify(order()));
  assert.ok(!Object.values(options.headers).includes(secret));return response(200,{id:456});
 });
 assert.deepEqual(await api.createOrder(order()),{status:'accepted',supplierOrderId:'456',httpStatus:200});assert.equal(calls,1);
});
test('GET signs empty body and accepts documented single-order array',async()=>{
 const api=client(async(url,options)=>{
  assert.equal(url,'https://api.apliiq.com/v1/Order/456');assert.equal(options.method,'GET');assert.equal(options.body,undefined);
  const sig=createHmac('sha256',secret).update(key+'1700000000fixture-nonce').digest('base64');
  assert.equal(options.headers.Authorization,`x-apliiq-auth 1700000000:${sig}:${key}:fixture-nonce`);
  return response(200,[{OrderId:456,Status:'Shipped',StoreSystemOrderId:'store-1',SN:[{TrackingNumber:'fixture-tracking'}]}]);
 });
 const result=await api.getOrder('456');assert.equal(result.status,'found');assert.equal(result.supplierOrderId,'456');assert.equal(result.order.Status,'Shipped');
});
test('202 is unknown/manual review even when body contains id',async()=>{
 let calls=0;const result=await client(async()=>{calls++;return response(202,{id:456,message:'private example'});}).createOrder(order());
 assert.deepEqual(result,{status:'unknown',httpStatus:202,reason:'not-processed',manualReview:true});assert.equal(calls,1);
});
test('malformed or missing successful create id and unexpected 2xx never become accepted',async()=>{
 for(const [status,body] of [[200,{}],[200,{id:0}],[200,{id:{}}],[201,{id:456}],[204,null]]){
  const result=await client(async()=>status===204?new Response(null,{status}):response(status,body)).createOrder(order());assert.equal(result.status,'unknown');assert.equal(result.manualReview,true);
 }
 const malformed=await client(async()=>new Response('invalid',{status:200})).createOrder(order());assert.equal(malformed.reason,'invalid-response');
});
test('server failures, rate limits and transport errors never auto retry or expose payload',async()=>{
 for(const code of [429,500,503]){let calls=0;const r=await client(async()=>{calls++;return response(code,{message:secret,address:'private'});}).createOrder(order());assert.equal(r.status,'unknown');assert.equal(calls,1);assert.ok(!JSON.stringify(r).includes(secret));assert.ok(!JSON.stringify(r).includes('private'));}
 const r=await client(async()=>{throw new Error(secret+' private address');}).createOrder(order());assert.equal(r.status,'unknown');assert.equal(r.reason,'transport-error');assert.ok(!JSON.stringify(r).includes(secret));
});
test('known client rejection is sanitized; GET mismatch or multiple orders is unknown',async()=>{
 const r=await client(async()=>response(401,{detail:secret})).createOrder(order());assert.deepEqual(r,{status:'rejected',httpStatus:401,reason:'provider-rejected'});
 for(const payload of [[{OrderId:999}],[{OrderId:456},{OrderId:456}],{}])assert.equal((await client(async()=>response(200,payload)).getOrder(456)).status,'unknown');
});
test('timeout covers hung fetch and response body; POST ambiguity is preserved',async()=>{
 for(const fetchImpl of [()=>new Promise(()=>{}),async()=>({status:200,text:()=>new Promise(()=>{})})]){
  const api=createApliiqClient({fetchImpl,key,secret,timeoutMs:15});const r=await api.createOrder(order());assert.equal(r.status,'unknown');assert.equal(r.reason,'timeout');assert.equal(r.manualReview,true);
 }
});
test('invalid config and malformed order rejected before network, with generic messages',async()=>{
 assert.throws(()=>createApliiqClient({fetchImpl:()=>{},key:'x:y',secret}),/configuration/);
 for(const timeoutMs of [0,-1,Infinity,60001])assert.throws(()=>createApliiqClient({fetchImpl:()=>{},key,secret,timeoutMs}),/configuration/);
 let calls=0;const api=client(async()=>{calls++;return response(200,{id:1});});
 for(const value of [null,{}, {...order(),line_items:[]},{...order(),shipping_address:{}},{...order(),line_items:[{...order().line_items[0],quantity:-1}]}])await assert.rejects(api.createOrder(value),/Invalid Apliiq order/);
 for(const id of ['../secret','1?key=private','',0])await assert.rejects(api.getOrder(id),/Invalid Apliiq order id/);
 assert.equal(calls,0);
});
test('webhook HMAC matches base64 raw bytes and rejects tampering/malformed headers',()=>{
 const rawBody=Buffer.from('{"fulfillment":{"order_id":"store-1","status":"success"}}');
 const signature=createHmac('sha256',secret).update(rawBody.toString('base64')).digest('base64');
 assert.equal(verifyApliiqWebhook({rawBody,signature,secret}),true);
 assert.equal(verifyApliiqWebhook({rawBody:Buffer.concat([rawBody,Buffer.from(' ')]),signature,secret}),false);
 for(const s of ['',signature.slice(1),signature+'=', 'sha256='+signature, 'A'.repeat(44),null])assert.equal(verifyApliiqWebhook({rawBody,signature:s,secret}),false);
 assert.equal(verifyApliiqWebhook({rawBody:JSON.parse(rawBody),signature,secret}),false);
 assert.equal(verifyApliiqWebhook({rawBody,signature,secret:'wrong'}),false);
 assert.equal(verifyApliiqWebhook({rawBody,signature,secret:''}),false);
});
test('oversized native response stream fails closed; POST conflict stays unknown',async()=>{
 const oversized=await client(async()=>new Response('x'.repeat(1024*1024+1),{status:200})).createOrder(order());
 assert.equal(oversized.status,'unknown');assert.equal(oversized.reason,'invalid-response');
 const conflict=await client(async()=>response(409,{id:456})).createOrder(order());assert.equal(conflict.status,'unknown');assert.equal(conflict.manualReview,true);
});
test('fresh nonces generated per request and invalid generators fail before fetch',async()=>{
 const headers=[];const api=createApliiqClient({key,secret,fetchImpl:async(_url,options)=>{headers.push(options.headers.Authorization);return response(200,{id:1});}});
 await api.createOrder(order());await api.createOrder(order());assert.notEqual(headers[0].replace(/^x-apliiq-auth /,'').split(':')[3],headers[1].replace(/^x-apliiq-auth /,'').split(':')[3]);
 let calls=0;
 for(const options of [{now:()=>NaN},{nonce:()=> 'bad:nonce'}]){
  const invalid=createApliiqClient({key,secret,fetchImpl:()=>{calls++;},...options});await assert.rejects(invalid.createOrder(order()),/configuration/);
 }
 assert.equal(calls,0);
});

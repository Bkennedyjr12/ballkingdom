import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const module=await import('../src/learning/private-content-service.js').catch(()=>({}));
const manager={fixture:'manager'},reviewer={fixture:'reviewer'},buyer={fixture:'buyer'};
const input=()=>({title:'Synthetic resource',type:'resource',source:{author:'Synthetic author',reference:'synthetic-source-reference'},
  rights:{ownershipStatus:'owned',licenseReference:null},access:{audience:'private',productId:null},
  upload:{originalName:'synthetic.pdf',mimeType:'application/pdf',sizeBytes:128,sha256:'a'.repeat(64)}});
function fixture(options={}){
  assert.equal(typeof module.createPrivateContentService,'function','Private ingestion service is implemented');
  const records=new Map(),calls=[];
  const repository={
    createForOwner:async(uid,id,record)=>{calls.push(['create',uid,id]);records.set(id,structuredClone(record));},
    getForOwner:async(uid,id)=>{calls.push(['ownerRead',uid,id]);const value=records.get(id);return value?.ownerUid===uid?structuredClone(value):null;},
    updateForOwner:async(uid,id,transform)=>{calls.push(['transaction',uid,id]);const value=records.get(id);const result=transform(value?.ownerUid===uid?structuredClone(value):null);records.set(id,structuredClone(result));return structuredClone(result);},
    getPublishedById:async id=>{calls.push(['publishedRead',id]);return structuredClone(records.get(id)??null);},
  };
  const identities=new Map([[manager,{uid:'synthetic-owner',appCheckValid:true,canManageContent:true}],
    [reviewer,{uid:'synthetic-owner',appCheckValid:true,canManageContent:true,canReviewContent:true}],
    [buyer,{uid:'synthetic-buyer',appCheckValid:true}]]);
  const rawProof={private:true,scanPassed:true,objectKey:'private-learning/synthetic-owner/sources/synthetic-source/raw',generation:'1',mimeType:'application/pdf',sizeBytes:128,sha256:'a'.repeat(64)};
  const release={private:true,reviewed:true,contentVersion:'v1',objectKey:'private-learning/synthetic-owner/releases/synthetic-source/v1/artifact',generation:'2',mimeType:'application/pdf',sizeBytes:64,sha256:'b'.repeat(64)};
  let grant=true;
  const service=module.createPrivateContentService({enabled:true,repository,
    authenticateRequest:async context=>identities.get(context)??null,now:()=>1700000000000,makeId:()=> 'synthetic-source',
    inspectRaw:async()=>structuredClone(rawProof),prepareRelease:async()=>structuredClone(release),
    resolveProduct:async id=>({productId:id,type:'resource',active:true,purchaseMode:'one_time',sourceId:'synthetic-source',contentVersion:'v1'}),
    hasActiveEntitlement:async(uid,productId,version)=>{calls.push(['entitlement',uid,productId,version]);return grant;},...options});
  return {service,records,calls,identities,rawProof,release,revoke:()=>{grant=false;}};
}
const id={sourceId:'synthetic-source'};
const approved={...id,ownershipStatus:'owned',licenseStatus:'verified',evidenceReference:'synthetic-rights-evidence',permitsPublic:true,permitsPaid:true};
async function reviewed(f,value=input()){
  await f.service.prepareDraft(value,manager);await f.service.submitForReview(id,manager);await f.service.review(approved,reviewer);
}

test('private content service defaults disabled and is not a deployed endpoint',async()=>{
  const f=fixture({enabled:false,authenticateRequest:()=>assert.fail('disabled auth')});
  await assert.rejects(f.service.prepareDraft(input(),manager),{code:'CONTENT_DISABLED'});
  await assert.rejects(f.service.authorizeDelivery(id,null),{code:'CONTENT_DISABLED'});
  assert.deepEqual(f.calls,[]);
  assert.doesNotMatch(readFileSync(new URL('../src/index.js',import.meta.url),'utf8'),/private-content-service/);
});
test('owner attribution, rights claims, private raw path and draft status are server controlled',async()=>{
  const f=fixture();const result=await f.service.prepareDraft(input(),manager);const saved=f.records.get(id.sourceId);
  assert.equal(saved.ownerUid,'synthetic-owner');assert.equal(saved.status,'draft');assert.equal(saved.licenseReview,null);
  assert.deepEqual(saved.source,input().source);assert.equal(saved.type,'resource');assert.equal(saved.raw.verified,false);
  assert.equal(result.uploadPlan.objectKey,'private-learning/synthetic-owner/sources/synthetic-source/raw');
  assert.equal(result.uploadPlan.authenticated,true);assert.equal(result.uploadPlan.private,true);
  assert.equal(result.uploadPlan.url,undefined);
});
test('unverified Auth, App Check, manager role and claimed ownership never write',async()=>{
  for(const identity of [null,{uid:'synthetic-owner',appCheckValid:false,canManageContent:true},
    {uid:'../other',appCheckValid:true,canManageContent:true},{uid:'synthetic-owner',appCheckValid:true}]){
    const f=fixture({authenticateRequest:async()=>identity});
    await assert.rejects(f.service.prepareDraft(input(),manager),{code:'CONTENT_AUTH_REQUIRED'});assert.deepEqual(f.calls,[]);
  }
  const f=fixture();
  for(const extra of [{ownerUid:'other'},{status:'published'},{objectKey:'public/raw'},{entitlement:true},{licenseReview:approved}])
    await assert.rejects(f.service.prepareDraft({...input(),...extra},manager),{code:'CONTENT_INPUT_INVALID'});
  assert.deepEqual(f.calls,[]);
});
test('source type, public/paid boundary and upload declarations are bounded',async()=>{
  const f=fixture();
  for(const value of [{...input(),type:'invented'}, {...input(),access:{audience:'paid',productId:null}},
    {...input(),access:{audience:'public',productId:'synthetic-product'}},
    {...input(),upload:{...input().upload,originalName:'../other.pdf'}},
    {...input(),upload:{...input().upload,mimeType:'text/html'}},
    {...input(),upload:{...input().upload,sizeBytes:30*1024*1024}},
    {...input(),upload:{...input().upload,sha256:'not-a-hash'}}])
    await assert.rejects(f.service.prepareDraft(value,manager),{code:'CONTENT_INPUT_INVALID'});
  assert.deepEqual(f.calls,[]);
  for(const type of ['course','guide','resource'])assert.equal((await fixture().service.prepareDraft({...input(),type},manager)).status,'draft');
});
test('raw source requires server-confirmed private storage, matching bytes and scan before review',async()=>{
  const f=fixture();await f.service.prepareDraft(input(),manager);
  for(const change of [{private:false},{scanPassed:false},{objectKey:'public/raw'},{sha256:'c'.repeat(64)},{sizeBytes:129},{generation:null}]){
    const original=structuredClone(f.rawProof);Object.assign(f.rawProof,change);
    await assert.rejects(f.service.submitForReview(id,manager),{code:'CONTENT_RAW_UNVERIFIED'});
    Object.assign(f.rawProof,original);assert.equal(f.records.get(id.sourceId).status,'draft');
  }
  await f.service.submitForReview(id,manager);assert.equal(f.records.get(id.sourceId).status,'review');
  assert.equal(f.records.get(id.sourceId).raw.generation,'1');
});
test('review privilege and verified rights evidence are required before publishing',async()=>{
  const f=fixture();await f.service.prepareDraft(input(),manager);
  await assert.rejects(f.service.publish(id,reviewer),{code:'CONTENT_NOT_APPROVED'});
  await f.service.submitForReview(id,manager);
  await assert.rejects(f.service.review(approved,manager),{code:'CONTENT_AUTH_REQUIRED'});
  await f.service.review({...approved,licenseStatus:'restricted',permitsPublic:false,permitsPaid:false},reviewer);
  await assert.rejects(f.service.publish(id,reviewer),{code:'CONTENT_NOT_APPROVED'});
  await assert.rejects(f.service.review({...approved,evidenceReference:''},reviewer),{code:'CONTENT_INPUT_INVALID'});
});
test('public publication requires rights approval and a reviewed derivative, never the raw upload',async()=>{
  const f=fixture();await reviewed(f,{...input(),access:{audience:'public',productId:null}});
  const original=structuredClone(f.release);
  for(const change of [{objectKey:f.rawProof.objectKey},{private:false},{reviewed:false}]){
    Object.assign(f.release,change);await assert.rejects(f.service.publish(id,reviewer),{code:'CONTENT_RELEASE_UNVERIFIED'});Object.assign(f.release,original);
  }
  await f.service.publish(id,reviewer);const allowed=await f.service.authorizeDelivery(id,null);
  assert.equal(f.records.get(id.sourceId).status,'published');assert.equal(allowed.objectKey,original.objectKey);
  assert.equal(allowed.generation,'2');assert.equal(allowed.raw,undefined);assert.equal(allowed.source,undefined);
});
test('published public status cannot override a prohibited public license boundary',async()=>{
  const f=fixture();await reviewed(f,{...input(),access:{audience:'public',productId:null}});
  await f.service.review({...approved,permitsPublic:false},reviewer);
  await assert.rejects(f.service.publish(id,reviewer),{code:'CONTENT_NOT_APPROVED'});
  await assert.rejects(f.service.authorizeDelivery(id,null),{code:'CONTENT_UNAVAILABLE'});
});
test('paid access requires server-approved one-time product/version and active owner entitlement',async()=>{
  const f=fixture();await reviewed(f,{...input(),access:{audience:'paid',productId:'synthetic-product'}});await f.service.publish(id,reviewer);
  await assert.rejects(f.service.authorizeDelivery(id,null),{code:'CONTENT_UNAVAILABLE'});
  await assert.rejects(f.service.authorizeDelivery({...id,entitlement:true},buyer),{code:'CONTENT_INPUT_INVALID'});
  const result=await f.service.authorizeDelivery(id,buyer);assert.equal(result.generation,'2');
  assert.deepEqual(f.calls.at(-1),['entitlement','synthetic-buyer','synthetic-product','v1']);
  f.revoke();await assert.rejects(f.service.authorizeDelivery(id,buyer),{code:'CONTENT_UNAVAILABLE'});
});
test('unsupported membership or unapproved paid product cannot publish',async()=>{
  for(const extra of [{active:false},{purchaseMode:'membership'},{sourceId:'other'},{contentVersion:'v2'}]){
    const f=fixture({resolveProduct:async productId=>({productId,type:'resource',active:true,purchaseMode:'one_time',sourceId:id.sourceId,contentVersion:'v1',...extra})});
    await reviewed(f,{...input(),access:{audience:'paid',productId:'synthetic-product'}});
    await assert.rejects(f.service.publish(id,reviewer),{code:'CONTENT_PRODUCT_UNAPPROVED'});
  }
});
test('reopening removes publication approval and prevents future delivery',async()=>{
  const f=fixture();await reviewed(f,{...input(),access:{audience:'public',productId:null}});await f.service.publish(id,reviewer);
  await f.service.reopenDraft(id,manager);const record=f.records.get(id.sourceId);
  assert.equal(record.status,'draft');assert.equal(record.licenseReview,null);assert.equal(record.approvedArtifact,null);
  await assert.rejects(f.service.authorizeDelivery(id,null),{code:'CONTENT_UNAVAILABLE'});
});
test('private published derivatives remain limited to the verified content owner',async()=>{
  const f=fixture();await reviewed(f);await f.service.publish(id,reviewer);
  await assert.rejects(f.service.authorizeDelivery(id,null),{code:'CONTENT_UNAVAILABLE'});
  await assert.rejects(f.service.authorizeDelivery(id,buyer),{code:'CONTENT_UNAVAILABLE'});
  assert.equal((await f.service.authorizeDelivery(id,manager)).generation,'2');
  await assert.rejects(f.service.prepareDraft(input(),{uid:'synthetic-owner',appCheckValid:true,canManageContent:true}),{code:'CONTENT_AUTH_REQUIRED'});
});
test('malformed published state cannot bypass the raw or audience boundary',async()=>{
  const f=fixture();await reviewed(f,{...input(),access:{audience:'public',productId:null}});await f.service.publish(id,reviewer);
  const saved=structuredClone(f.records.get(id.sourceId));
  for(const altered of [{...saved,access:undefined},{...saved,raw:{...saved.raw,objectKey:'public/raw'}},{...saved,raw:{...saved.raw,generation:null}}]){
    f.records.set(id.sourceId,altered);
    await assert.rejects(f.service.authorizeDelivery(id,null),{code:'CONTENT_UNAVAILABLE'});
  }
});
test('cross-owner lookups and provider failures are bounded without private detail',async()=>{
  const f=fixture();await f.service.prepareDraft(input(),manager);f.identities.set(manager,{uid:'other-owner',appCheckValid:true,canManageContent:true});
  await assert.rejects(f.service.submitForReview(id,manager),{code:'CONTENT_UNAVAILABLE'});
  const broken=fixture({repository:{createForOwner:async()=>{throw new Error('synthetic-private-provider-detail');},getForOwner:async()=>{},updateForOwner:async()=>{},getPublishedById:async()=>{}}});
  await assert.rejects(broken.service.prepareDraft(input(),manager),error=>error.code==='CONTENT_WRITE_FAILED'&&!error.message.includes('provider-detail'));
  const unsafe=fixture({repository:{createForOwner:async()=>{},getForOwner:async()=>{},updateForOwner:async()=>{throw Object.assign(new Error('synthetic-private-provider-detail'),{code:'CONTENT_PRIVATE_PROVIDER_ERROR'});},getPublishedById:async()=>{}}});
  await assert.rejects(unsafe.service.reopenDraft(id,manager),error=>error.code==='CONTENT_WRITE_FAILED'&&!error.message.includes('provider-detail'));
});

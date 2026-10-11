import {randomUUID} from 'node:crypto';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const GENERATION=/^[1-9][0-9]{0,30}$/;
const MAX_BYTES=25*1024*1024;
const MIME=new Set(['application/pdf','text/plain','text/markdown','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const safeId=value=>typeof value==='string'&&ID.test(value);
const boundedErrors=new WeakSet();
const error=(code,message)=>{const value=Object.assign(new Error(message),{code});boundedErrors.add(value);return value;};
const deny=()=>{throw error('CONTENT_UNAVAILABLE','Content is unavailable.');};
const invalid=()=>{throw error('CONTENT_INPUT_INVALID','Content input is invalid.');};
const rawKey=(uid,id)=>`private-learning/${uid}/sources/${id}/raw`;

function checkDraft(input){
  if(!exact(input,['title','type','source','rights','access','upload'])||!text(input.title,160)
    ||!['course','guide','resource'].includes(input.type)
    ||!exact(input.source,['author','reference'])||!text(input.source.author,160)||!text(input.source.reference,500)
    ||!exact(input.rights,['ownershipStatus','licenseReference'])||!['unverified','owned','third_party'].includes(input.rights.ownershipStatus)
    ||input.rights.licenseReference!==null&&!text(input.rights.licenseReference,500)
    ||!exact(input.access,['audience','productId'])||!['private','public','paid'].includes(input.access.audience)
    ||(input.access.audience==='paid'?!safeId(input.access.productId):input.access.productId!==null)
    ||!exact(input.upload,['originalName','mimeType','sizeBytes','sha256'])||!text(input.upload.originalName,180)
    ||/[\\/]/.test(input.upload.originalName)||['.','..'].includes(input.upload.originalName)
    ||!MIME.has(input.upload.mimeType)||!Number.isSafeInteger(input.upload.sizeBytes)||input.upload.sizeBytes<1||input.upload.sizeBytes>MAX_BYTES
    ||typeof input.upload.sha256!=='string'||!HASH.test(input.upload.sha256))invalid();
}
function checkId(input){if(!exact(input,['sourceId'])||!safeId(input.sourceId))invalid();return input.sourceId;}
function validArtifact(value,uid,id){
  return object(value)&&value.private===true&&value.reviewed===true&&safeId(value.contentVersion)
    &&value.objectKey===`private-learning/${uid}/releases/${id}/${value.contentVersion}/artifact`
    &&typeof value.generation==='string'&&GENERATION.test(value.generation)&&MIME.has(value.mimeType)
    &&Number.isSafeInteger(value.sizeBytes)&&value.sizeBytes>0&&value.sizeBytes<=MAX_BYTES
    &&typeof value.sha256==='string'&&HASH.test(value.sha256);
}
function approved(record){
  const review=record?.licenseReview;
  return record?.schemaVersion==='bk-private-content-v1'&&safeId(record.ownerUid)&&safeId(record.sourceId)
    &&record.status==='review'&&record.raw?.verified===true&&record.raw.objectKey===rawKey(record.ownerUid,record.sourceId)
    &&typeof record.raw.generation==='string'&&GENERATION.test(record.raw.generation)
    &&object(record.access)&&['private','public','paid'].includes(record.access.audience)
    &&(record.access.audience==='paid'?safeId(record.access.productId):record.access.productId===null)
    &&review?.licenseStatus==='verified'
    &&['owned','third_party'].includes(review.ownershipStatus)&&text(review.evidenceReference,500)
    &&(record.access.audience==='public'?review.permitsPublic===true:record.access.audience==='paid'?review.permitsPaid===true:true);
}
function productMatches(product,record,artifact){
  return product?.active===true&&product.purchaseMode==='one_time'&&product.productId===record.access.productId
    &&product.type===record.type&&product.sourceId===record.sourceId&&product.contentVersion===artifact.contentVersion;
}

// Local scaffold only. Not imported/exported by Functions index.js. No SDK, HTTP,
// upload, URL signing, Hosting write, role grant or provider call is implemented.
// All adapters below are trusted SERVER dependencies, never request fields.
export function createPrivateContentService({enabled=false,repository,authenticateRequest,inspectRaw,prepareRelease,
  resolveProduct,hasActiveEntitlement,now=Date.now,makeId=randomUUID}={}){
  const active=enabled===true;
  if(active&&(['createForOwner','getForOwner','updateForOwner','getPublishedById'].some(key=>typeof repository?.[key]!=='function')
    ||[authenticateRequest,inspectRaw,prepareRelease,resolveProduct,hasActiveEntitlement,now,makeId].some(fn=>typeof fn!=='function')))
    throw error('CONTENT_CONFIGURATION_INVALID','Content ingestion is unavailable.');
  function enabledOnly(){if(!active)throw error('CONTENT_DISABLED','Content ingestion is not connected.');}
  function stamp(){const value=now();if(!Number.isSafeInteger(value)||value<0)throw error('CONTENT_CONFIGURATION_INVALID','Content ingestion is unavailable.');return value;}
  async function identity(context,role){
    enabledOnly();let result;try{result=await authenticateRequest(context);}catch{result=null;}
    if(!safeId(result?.uid)||result.appCheckValid!==true||role&&result[role]!==true)
      throw error('CONTENT_AUTH_REQUIRED','Verified content access and App Check are required.');
    return result;
  }
  function owned(record,uid,id){if(!object(record)||record.ownerUid!==uid||record.sourceId!==id||!object(record.raw)||!object(record.access))deny();return record;}
  async function load(uid,id){let value;try{value=await repository.getForOwner(uid,id);}catch{deny();}return owned(value,uid,id);}
  async function update(uid,id,transform){
    try{return await repository.updateForOwner(uid,id,value=>transform(owned(value,uid,id)));}
    catch(e){if(boundedErrors.has(e))throw e;throw error('CONTENT_WRITE_FAILED','Content could not be saved. Try again later.');}
  }
  async function prepareDraft(input,context){
    const {uid}=await identity(context,'canManageContent');checkDraft(input);const id=makeId(),time=stamp();
    if(!safeId(id))throw error('CONTENT_CONFIGURATION_INVALID','Content ingestion is unavailable.');
    const record={schemaVersion:'bk-private-content-v1',ownerUid:uid,sourceId:id,...structuredClone(input),
      status:'draft',raw:{objectKey:rawKey(uid,id),generation:null,verified:false},licenseReview:null,approvedArtifact:null,createdAtMs:time,updatedAtMs:time};
    try{await repository.createForOwner(uid,id,record);}catch{throw error('CONTENT_WRITE_FAILED','Content could not be saved. Try again later.');}
    return {sourceId:id,status:'draft',uploadPlan:{objectKey:record.raw.objectKey,mimeType:input.upload.mimeType,maxBytes:MAX_BYTES,private:true,authenticated:true}};
  }
  async function submitForReview(input,context){
    const {uid}=await identity(context,'canManageContent'),id=checkId(input),record=await load(uid,id);
    if(record.status!=='draft')throw error('CONTENT_NOT_APPROVED','Content must be a draft.');
    let proof;try{proof=await inspectRaw(uid,id,record.raw.objectKey);}catch{proof=null;}
    if(proof?.private!==true||proof.scanPassed!==true||proof.objectKey!==rawKey(uid,id)
      ||typeof proof.generation!=='string'||!GENERATION.test(proof.generation)
      ||proof.mimeType!==record.upload.mimeType||proof.sizeBytes!==record.upload.sizeBytes||proof.sha256!==record.upload.sha256)
      throw error('CONTENT_RAW_UNVERIFIED','The private source upload has not been verified.');
    await update(uid,id,current=>{
      if(current.status!=='draft'||current.raw.objectKey!==record.raw.objectKey||JSON.stringify(current.upload)!==JSON.stringify(record.upload))deny();
      return {...current,status:'review',raw:{objectKey:rawKey(uid,id),generation:proof.generation,verified:true},licenseReview:null,approvedArtifact:null,updatedAtMs:stamp()};
    });return {sourceId:id,status:'review'};
  }
  async function review(input,context){
    const {uid}=await identity(context,'canReviewContent');
    if(!exact(input,['sourceId','ownershipStatus','licenseStatus','evidenceReference','permitsPublic','permitsPaid'])||!safeId(input.sourceId)
      ||!['owned','third_party','unverified'].includes(input.ownershipStatus)||!['verified','restricted'].includes(input.licenseStatus)
      ||!text(input.evidenceReference,500)||typeof input.permitsPublic!=='boolean'||typeof input.permitsPaid!=='boolean'
      ||input.licenseStatus==='verified'&&input.ownershipStatus==='unverified'
      ||input.licenseStatus==='restricted'&&(input.permitsPublic||input.permitsPaid))invalid();
    await update(uid,input.sourceId,current=>{
      if(current.status!=='review'||current.raw.verified!==true)throw error('CONTENT_NOT_APPROVED','Content is not ready for review.');
      const {sourceId,...decision}=input;
      return {...current,licenseReview:{...decision,reviewerUid:uid,reviewedAtMs:stamp()},updatedAtMs:stamp()};
    });return {sourceId:input.sourceId,status:'review'};
  }
  async function publish(input,context){
    const {uid}=await identity(context,'canReviewContent'),id=checkId(input),record=await load(uid,id);
    if(!approved(record))throw error('CONTENT_NOT_APPROVED','Verified source and rights review are required.');
    let artifact;try{artifact=await prepareRelease(uid,id,structuredClone(record));}catch{artifact=null;}
    if(!validArtifact(artifact,uid,id))throw error('CONTENT_RELEASE_UNVERIFIED','A reviewed private release artifact is required.');
    if(record.access.audience==='paid'){
      let product;try{product=await resolveProduct(record.access.productId);}catch{product=null;}
      if(!productMatches(product,record,artifact))throw error('CONTENT_PRODUCT_UNAPPROVED','The one-time product and content version require approval.');
    }
    // Store only the reviewed artifact's bounded, immutable identity. Raw metadata
    // and caller/provider extras never become a delivery response.
    const derivative=Object.fromEntries(['contentVersion','objectKey','generation','mimeType','sizeBytes','sha256','private','reviewed'].map(key=>[key,artifact[key]]));
    await update(uid,id,current=>{
      if(!approved(current)||current.raw.generation!==record.raw.generation)throw error('CONTENT_NOT_APPROVED','Content approval changed.');
      return {...current,status:'published',approvedArtifact:derivative,updatedAtMs:stamp()};
    });return {sourceId:id,status:'published'};
  }
  async function reopenDraft(input,context){
    const {uid}=await identity(context,'canManageContent'),id=checkId(input);
    await update(uid,id,current=>({...current,status:'draft',licenseReview:null,approvedArtifact:null,updatedAtMs:stamp()}));
    return {sourceId:id,status:'draft'};
  }
  // INTERNAL server-stream authorization only. Do not return object keys to a
  // browser or create public/token download URLs. A future adapter must stream
  // the pinned generation with no-store headers and recheck live access.
  async function authorizeDelivery(input,context){
    enabledOnly();const id=checkId(input);let record;
    try{record=await repository.getPublishedById(id);}catch{deny();}
    if(!object(record)||record.sourceId!==id||!safeId(record.ownerUid)||record.status!=='published'
      ||!approved({...record,status:'review'})||!validArtifact(record.approvedArtifact,record.ownerUid,id))deny();
    if(record.access.audience!=='public'){
      let viewer;try{viewer=await identity(context);}catch{deny();}
      if(record.access.audience==='private'){
        if(viewer.uid!==record.ownerUid||viewer.canManageContent!==true)deny();
      }else if(record.access.audience==='paid'){
        let product,grant;try{product=await resolveProduct(record.access.productId);
          if(productMatches(product,record,record.approvedArtifact))grant=await hasActiveEntitlement(viewer.uid,product.productId,product.contentVersion);
        }catch{deny();}
        if(grant!==true)deny();
      }else deny();
    }
    return {sourceId:id,...structuredClone(record.approvedArtifact)};
  }
  return Object.freeze({prepareDraft,submitForReview,review,publish,reopenDraft,authorizeDelivery});
}

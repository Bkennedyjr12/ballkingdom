const SKU='home-inspection-study-guide';
const MAX_POLLS=12;
const POLL_DELAY_MS=5000;
const STATUS_KEYS=Object.freeze(['orderHandle','status','message','downloadReady']);
const SAFE_STATUSES=new Set(['invoice_send_pending','payment_verification_pending','paid','fulfillment_delayed','fulfilled','cancelled','manual_support']);
const TERMINAL_STATUSES=new Set(['fulfilled','cancelled','manual_support']);
const DISPLAY_PAYMENT_METHODS=Object.freeze({card:'card',apple_pay:'Apple Pay',paypal:'PayPal',venmo:'Venmo'});
const FUNCTION_ORIGIN='https://us-west1-the-ballers-kingdom.cloudfunctions.net';
const MAX_PDF_BYTES=80*1024*1024;
const DOWNLOAD_FILENAME='Home Inspection Study Guide.pdf';
const DOWNLOAD_DEADLINE_MS=30000;
const GRANT_PATTERN=/^[A-Za-z0-9_-]{43}$/;

function isPlainRecord(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
function validateStatusResponse(value){
  if(!isPlainRecord(value)||Object.keys(value).some(key=>!STATUS_KEYS.includes(key)))throw new Error('Unexpected order status response');
  if(typeof value.orderHandle!=='string'||value.orderHandle.length<1||value.orderHandle.length>128||!SAFE_STATUSES.has(value.status)||typeof value.message!=='string'||value.message.length>300||typeof value.downloadReady!=='boolean'||value.downloadReady!==(value.status==='fulfilled'))throw new Error('Invalid order status response');
  return Object.freeze({...value});
}
function validateOrderResponse(value){
  const keys=['orderHandle','amountCents','currency','status','message'];
  if(!isPlainRecord(value)||Object.keys(value).some(key=>!keys.includes(key))||typeof value.orderHandle!=='string'||value.orderHandle.length<1||value.orderHandle.length>128||!Number.isSafeInteger(value.amountCents)||value.amountCents<=0||value.currency!=='USD'||!SAFE_STATUSES.has(value.status)||typeof value.message!=='string'||value.message.length>300)throw new Error('Invalid order response');
  return Object.freeze({...value});
}
function validateCapabilityResponse(value){
  if(!isPlainRecord(value)||Object.keys(value).length!==1||!Array.isArray(value.products))throw new Error('Invalid capability response');
  const products=value.products.map(item=>{
    const displayKeys=['name','amountCents','currency','invoiceProvider','paymentMethods','delivery'];
    if(!isPlainRecord(item)||Object.keys(item).length!==3||typeof item.sku!=='string'||item.sku.length<1||item.sku.length>128||typeof item.active!=='boolean'||!isPlainRecord(item.display)||Object.keys(item.display).length!==displayKeys.length||displayKeys.some(key=>!Object.hasOwn(item.display,key)))throw new Error('Invalid capability response');
    const display=item.display;
    if(typeof display.name!=='string'||display.name.trim().length<1||display.name.length>160||!Number.isSafeInteger(display.amountCents)||display.amountCents<1||display.amountCents>100000000||display.currency!=='USD'||display.invoiceProvider!=='quickbooks'||display.delivery!=='protected_electronic_delivery'||!Array.isArray(display.paymentMethods)||display.paymentMethods.length<1||display.paymentMethods.length>4||new Set(display.paymentMethods).size!==display.paymentMethods.length||display.paymentMethods.some(method=>!Object.hasOwn(DISPLAY_PAYMENT_METHODS,method)))throw new Error('Invalid capability response');
    return Object.freeze({...item,display:Object.freeze({...display,paymentMethods:Object.freeze([...display.paymentMethods])})});
  });
  return Object.freeze({products:Object.freeze(products)});
}
function deliveryFailure(){return new Error('Protected delivery failed');}
function validateDownloadGrant(value,nowMs=Date.now()){
  if(!isPlainRecord(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'grant')||!Object.hasOwn(value,'expiresAt')||typeof value.grant!=='string'||!GRANT_PATTERN.test(value.grant)||typeof value.expiresAt!=='string')throw deliveryFailure();
  const expiresAtMs=Date.parse(value.expiresAt);
  if(!Number.isFinite(expiresAtMs)||new Date(expiresAtMs).toISOString()!==value.expiresAt||expiresAtMs<=nowMs)throw deliveryFailure();
  return Object.freeze({grant:value.grant,expiresAt:value.expiresAt});
}
function abortRejection(signal){return new Promise((_,reject)=>{if(signal.aborted)reject(deliveryFailure());else signal.addEventListener('abort',()=>reject(deliveryFailure()),{once:true});});}
function cancelReader(reader){try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}}
async function readBoundedPdf(response,{signal,onReader}={}){
  const rawLength=response.headers.get('Content-Length');
  let declaredLength=null;
  if(rawLength!==null){if(!/^[1-9]\d*$/.test(rawLength))throw new Error('Protected delivery failed');declaredLength=Number(rawLength);if(!Number.isSafeInteger(declaredLength)||declaredLength>MAX_PDF_BYTES)throw new Error('Protected delivery failed');}
  const reader=response.body?.getReader?.();
  if(!reader)throw deliveryFailure();
  if(typeof onReader==='function')onReader(reader);
  const aborted=abortRejection(signal);
  const chunks=[];let total=0;
  try{for(;;){const {done,value}=await Promise.race([reader.read(),aborted]);if(done)break;if(!(value instanceof Uint8Array)||value.byteLength<1)continue;total+=value.byteLength;if(total>MAX_PDF_BYTES){cancelReader(reader);throw deliveryFailure();}chunks.push(value);}}catch{cancelReader(reader);throw deliveryFailure();}
  if(total<1||(declaredLength!==null&&declaredLength!==total))throw deliveryFailure();
  return new Blob(chunks,{type:'application/pdf'});
}
function validBoundary(boundary){const required=['getBuyerCommerceCapability','requestPublicSignInLink','completeEmailLink','createDigitalOrder','getOrderStatus','createDownloadGrant','redeemDownloadGrant'];return boundary&&required.every(name=>typeof boundary[name]==='function')?boundary:null;}
async function firebaseRuntime(){const ready=window.__BALLERS_FIREBASE_RUNTIME_READY__;if(ready&&typeof ready.then==='function'){try{await ready;}catch{return null;}}const runtime=window.__BALLERS_FIREBASE_RUNTIME__;return runtime&&typeof runtime==='object'?runtime:null;}
async function realCallable(name,data,{auth=false}={}){
  const runtime=await firebaseRuntime();
  if(!runtime||typeof runtime.getAppCheckToken!=='function')throw new Error('Firebase App Check is unavailable');
  const appCheckToken=await runtime.getAppCheckToken();
  if(typeof appCheckToken!=='string'||!appCheckToken)throw new Error('Firebase App Check is unavailable');
  const headers={'Content-Type':'application/json','X-Firebase-AppCheck':appCheckToken};
  if(auth){if(typeof runtime.getIdToken!=='function')throw new Error('Firebase Auth is unavailable');const idToken=await runtime.getIdToken();if(typeof idToken!=='string'||!idToken)throw new Error('Firebase Auth is unavailable');headers.Authorization=`Bearer ${idToken}`;}
  const response=await fetch(`${FUNCTION_ORIGIN}/${name}`,{method:'POST',headers,body:JSON.stringify({data}),credentials:'omit',referrerPolicy:'no-referrer'});
  const envelope=await response.json();
  if(!response.ok||!isPlainRecord(envelope)||Object.keys(envelope).length!==1||!Object.hasOwn(envelope,'data'))throw new Error('Firebase callable failed');
  return envelope.data;
}
async function realBoundary(){
  const runtime=await firebaseRuntime();
  if(!runtime||typeof runtime.completeEmailLink!=='function')return null;
  return Object.freeze({
    getBuyerCommerceCapability:()=>realCallable('getBuyerCommerceCapability',{}),
    requestPublicSignInLink:data=>realCallable('requestPilotSignInLink',data),
    completeEmailLink:data=>runtime.completeEmailLink(data),
    createDigitalOrder:data=>realCallable('createDigitalOrder',data,{auth:true}),
    getOrderStatus:data=>realCallable('getOrderStatus',data,{auth:true}),
    createDownloadGrant:data=>realCallable('createDownloadGrant',data,{auth:true}),
    async redeemDownloadGrant(data){
      if(!isPlainRecord(data)||Object.keys(data).length!==2||typeof data.orderHandle!=='string'||data.orderHandle.length<1||data.orderHandle.length>128||typeof data.grant!=='string'||!GRANT_PATTERN.test(data.grant))throw deliveryFailure();
      const activeRuntime=await firebaseRuntime();
      if(!activeRuntime||typeof activeRuntime.getIdToken!=='function'||typeof activeRuntime.getLimitedUseAppCheckToken!=='function')throw new Error('Protected delivery is unavailable');
      const idToken=await activeRuntime.getIdToken();
      const limitedUseToken=await activeRuntime.getLimitedUseAppCheckToken();
      if(typeof idToken!=='string'||!idToken||typeof limitedUseToken!=='string'||!limitedUseToken)throw new Error('Protected delivery is unavailable');
      let objectUrl=null;let reader=null;
      const controller=new AbortController();
      const configuredDeadline=Number(window.__commerceTestDownloadTimeoutMs);
      const deadlineMs=Number.isFinite(configuredDeadline)&&configuredDeadline>0?Math.min(configuredDeadline,DOWNLOAD_DEADLINE_MS):DOWNLOAD_DEADLINE_MS;
      const deadline=window.setTimeout(()=>{controller.abort();cancelReader(reader);},deadlineMs);
      try{
        const response=await Promise.race([fetch(`${FUNCTION_ORIGIN}/redeemDownloadGrant`,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${idToken}`,'X-Firebase-AppCheck':limitedUseToken},
          body:JSON.stringify({orderHandle:data.orderHandle,grant:data.grant}),
          credentials:'omit',
          referrerPolicy:'no-referrer',
          signal:controller.signal,
        }),abortRejection(controller.signal)]);
        if(response.status!==200||response.headers.get('Content-Type')!=='application/pdf')throw new Error('Protected delivery failed');
        const blob=await readBoundedPdf(response,{signal:controller.signal,onReader:value=>{reader=value;}});
        if(blob.type!=='application/pdf'||blob.size<1||blob.size>MAX_PDF_BYTES)throw new Error('Protected delivery failed');
        objectUrl=URL.createObjectURL(blob);
        const link=document.createElement('a');
        link.href=objectUrl;
        link.download=DOWNLOAD_FILENAME;
        link.click();
        await new Promise(resolve=>window.setTimeout(resolve,0));
        return Object.freeze({streamed:true});
      }finally{
        window.clearTimeout(deadline);
        if(!controller.signal.aborted)controller.abort();
        cancelReader(reader);
        if(objectUrl!==null)URL.revokeObjectURL(objectUrl);
      }
    },
  });
}
async function getCommerceBoundary(){return validBoundary(window.__BALLERS_COMMERCE__)??validBoundary(await realBoundary());}
function setStatus(message){const node=document.querySelector('[data-commerce-status]');if(node)node.textContent=message;}
function paymentMethodText(methods){return methods.map(method=>DISPLAY_PAYMENT_METHODS[method]).join(', ');}
function renderProductDisplay(display){
  const name=document.querySelector('[data-product-name]');if(name)name.textContent=display.name;
  const price=document.querySelector('[data-price]');if(price)price.textContent=new Intl.NumberFormat('en-US',{style:'currency',currency:display.currency}).format(display.amountCents/100);
  const provider=document.querySelector('[data-invoice-provider]');if(provider)provider.textContent='QuickBooks invoice';
  const delivery=document.querySelector('[data-delivery]');if(delivery)delivery.textContent='Protected electronic delivery';
  const methods=document.querySelector('[data-payment-methods]');if(methods)methods.textContent=paymentMethodText(display.paymentMethods);
  const methodsNote=document.querySelector('[data-payment-methods-note]');if(methodsNote)methodsNote.hidden=false;
  const applePayNote=document.querySelector('[data-apple-pay-note]');if(applePayNote)applePayNote.hidden=!display.paymentMethods.includes('apple_pay');
  const applePayLabel=document.querySelector('[data-apple-pay-label]');if(applePayLabel)applePayLabel.textContent=DISPLAY_PAYMENT_METHODS.apple_pay;
}
function setStep(status){const index=status==='fulfilled'?3:status==='paid'||status==='fulfillment_delayed'?2:status==='invoice_send_pending'||status==='payment_verification_pending'?1:0;document.querySelectorAll('.commerce-rail li').forEach((node,nodeIndex)=>{node.classList.toggle('is-current',nodeIndex===index);node.classList.toggle('is-complete',nodeIndex<index);});const stage=document.querySelector('[data-stage-number]');const labels=['Identity','Invoice email','Verification','Protected delivery'];if(stage)stage.textContent=`0${index+1} / ${labels[index]}`;}
function renderStatus(status){setStep(status.status);setStatus(status.message);const panel=document.querySelector('[data-download-panel]');if(panel)panel.hidden=!status.downloadReady;const support=document.querySelector('[data-support]');if(support)support.hidden=status.status!=='manual_support';}
async function pollStatus(boundary,orderHandle,{delay=POLL_DELAY_MS,maxPolls=MAX_POLLS}={}){for(let attempt=0;attempt<maxPolls;attempt+=1){const status=validateStatusResponse(await boundary.getOrderStatus({orderHandle}));renderStatus(status);if(TERMINAL_STATUSES.has(status.status))return status;if(attempt+1<maxPolls)await new Promise(resolve=>window.setTimeout(resolve,delay));}if(maxPolls>1)setStatus('Payment verification is taking longer than expected. Return later while the server continues checking QuickBooks.');return null;}

async function initialize(){
  const authForm=document.querySelector('[data-auth-form]');const orderForm=document.querySelector('[data-order-form]');if(!authForm||!orderForm)return;const orderButton=document.querySelector('[data-order-button]');const authButton=authForm.querySelector('button');let orderHandle=null;let polling=false;let authRequestInFlight=false;let orderSubmissionInFlight=false;let createdOrder=false;
  const boundary=await getCommerceBoundary();
  const query=new URLSearchParams(window.location.search);
  const existingHandle=query.get('order');
  const existingOrder=typeof existingHandle==='string'&&existingHandle.length>0&&existingHandle.length<=128;
  let existingStatusLoaded=false;
  if(boundary&&existingOrder){try{polling=true;orderHandle=existingHandle;await pollStatus(boundary,orderHandle,{delay:window.__commerceTestCalls?0:POLL_DELAY_MS,maxPolls:window.__commerceTestCalls?1:MAX_POLLS});existingStatusLoaded=true;}catch{setStatus('We could not safely read this order. Sign in as its verified owner to continue.');document.querySelector('[data-support]').hidden=false;}finally{polling=false;}}
  let capability;
  try{capability=validateCapabilityResponse(await boundary?.getBuyerCommerceCapability());}catch{capability=null;}
  const requestedSku=query.get('sku');
  const capabilityProduct=capability?.products.find(item=>item.sku===requestedSku);
  if(capabilityProduct)renderProductDisplay(capabilityProduct.display);
  const active=requestedSku===SKU&&capabilityProduct?.active===true;
  if(!boundary||(!active&&!existingOrder)){if(orderButton)orderButton.disabled=true;if(authButton)authButton.disabled=true;if(!existingStatusLoaded&&!existingHandle)setStatus('Purchasing is temporarily unavailable. No payment or invoice request was created.');return;}
  if(existingOrder){const nameInput=orderForm.querySelector('[name="customerName"]');if(nameInput){nameInput.required=false;const group=nameInput.closest('.field-group');if(group)group.hidden=true;}const explanation=orderForm.querySelector('.commerce-explainer');if(explanation)explanation.textContent='Sign in with the same verified address to resume this existing order. This does not create or send another invoice.';if(orderButton)orderButton.textContent='Sign in and resume order';}
  orderButton.disabled=false;authButton.disabled=false;
  authForm?.addEventListener('submit',async event=>{event.preventDefault();if(authRequestInFlight||!authButton)return;authRequestInFlight=true;authButton.disabled=true;const email=new FormData(authForm).get('email');try{const request=existingOrder?{email:String(email||''),orderHandle:existingHandle}:{email:String(email||'')};const result=await boundary.requestPublicSignInLink(request);if(!isPlainRecord(result)||Object.keys(result).length!==1||result.status!=='request_received')throw new Error('Invalid response');}catch{/* Deliberately indistinguishable public outcome. */}finally{authRequestInFlight=false;authButton.disabled=false;}setStatus('If this address is eligible, a sign-in link request has been received. Use only the newest link.');});
  orderForm?.addEventListener('submit',async event=>{event.preventDefault();if(orderSubmissionInFlight||createdOrder||!orderButton)return;orderSubmissionInFlight=true;orderButton.disabled=true;try{const email=String(new FormData(authForm).get('email')||'');const signIn=await boundary.completeEmailLink({email});if(!isPlainRecord(signIn)||Object.keys(signIn).length!==1||signIn.signedIn!==true)throw new Error('Invalid sign-in result');polling=true;if(existingOrder){await pollStatus(boundary,orderHandle,{delay:window.__commerceTestCalls?0:POLL_DELAY_MS,maxPolls:window.__commerceTestCalls?1:MAX_POLLS});return;}const customerName=String(new FormData(orderForm).get('customerName')||'').trim();const idempotencyKey=globalThis.crypto?.randomUUID?.()??`order-${Date.now().toString(36)}`;const created=validateOrderResponse(await boundary.createDigitalOrder({sku:SKU,customerName,idempotencyKey}));orderHandle=created.orderHandle;createdOrder=true;const safeUrl=new URL(window.location.href);safeUrl.search='';safeUrl.searchParams.set('sku',SKU);safeUrl.searchParams.set('order',orderHandle);history.replaceState(null,'',safeUrl);setStatus('Your order was found. Safely checking its current payment and delivery status.');setStep(created.status);await pollStatus(boundary,orderHandle,{delay:window.__commerceTestCalls?0:POLL_DELAY_MS,maxPolls:window.__commerceTestCalls?1:MAX_POLLS});}catch{setStatus(existingOrder?'We could not safely resume this order. The sign-in link may be expired, modified, already used, or may not own this order. Request a newly approved link to continue.':'We could not safely create or read this order. The sign-in link may be expired, modified, already used, or may not own this order. Request a newly approved link to continue.');document.querySelector('[data-support]').hidden=false;}finally{polling=false;orderSubmissionInFlight=false;if(existingOrder||!createdOrder)orderButton.disabled=false;}});
  document.querySelector('[data-download-button]')?.addEventListener('click',async event=>{const button=event.currentTarget;if(!orderHandle||polling)return;button.disabled=true;let oneAttemptGrant=null;try{const grant=validateDownloadGrant(await boundary.createDownloadGrant({orderHandle}));oneAttemptGrant=grant.grant;await boundary.redeemDownloadGrant({orderHandle,grant:oneAttemptGrant});setStatus('Your protected delivery started. This one-time grant has been cleared.');}catch{setStatus('That one-time delivery attempt could not be completed. Your verified order is still safe; request a new download when ready.');}finally{oneAttemptGrant=null;button.disabled=false;}});
}
if(typeof document!=='undefined')initialize();
export{DOWNLOAD_DEADLINE_MS,MAX_POLLS,MAX_PDF_BYTES,SAFE_STATUSES,validateStatusResponse,validateOrderResponse,validateCapabilityResponse,validateDownloadGrant,readBoundedPdf,pollStatus,getCommerceBoundary};

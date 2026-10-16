// Strategy Session checkout: QuickBooks invoice -> verified payment -> Calendly booking link.
// Fails closed: the button stays "opening soon" unless the server reports the offer active.
const SKU='strategy-session-30';
const FUNCTION_ORIGIN='https://us-west1-the-ballers-kingdom.cloudfunctions.net';
const BOOKING_ORIGIN='https://calendly.com';
const BOOKING_PATH='/ballerskingdom/30min';
const EMAIL_KEY='bk-strategy-email';
const NAME_KEY='bk-strategy-name';
const POLL_MS=8000;
const MAX_POLLS=90;

function $(s){return document.querySelector(s);}
function setMsg(text){const el=$('[data-strategy-status]');if(el)el.textContent=text;}
function isRecord(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
export function safeBookingUrl(value){try{const u=new URL(String(value));return u.origin===BOOKING_ORIGIN&&u.pathname===BOOKING_PATH?u.toString():null;}catch{return null;}}

async function runtime(){const ready=window.__BALLERS_FIREBASE_RUNTIME_READY__;if(ready&&typeof ready.then==='function'){try{await ready;}catch{return null;}}return window.__BALLERS_FIREBASE_RUNTIME__||null;}
async function callable(name,data,{auth=false}={}){
  const rt=await runtime();if(!rt)throw new Error('unavailable');
  const headers={'Content-Type':'application/json','X-Firebase-AppCheck':await rt.getAppCheckToken()};
  if(auth)headers.Authorization=`Bearer ${await rt.getIdToken()}`;
  const res=await fetch(`${FUNCTION_ORIGIN}/${name}`,{method:'POST',headers,body:JSON.stringify({data}),credentials:'omit',referrerPolicy:'no-referrer'});
  const env=await res.json();if(!res.ok||!isRecord(env)||!Object.hasOwn(env,'data'))throw new Error('failed');return env.data;
}

function closed(){
  const btn=$('[data-strategy-checkout]');if(btn){btn.textContent='Paid checkout opening soon';btn.setAttribute('aria-disabled','true');}
  const form=$('[data-strategy-form]');if(form)form.hidden=true;
}

function showBooking(url){
  const safe=safeBookingUrl(url);if(!safe)return false;
  const box=$('[data-strategy-booking]');const link=$('[data-strategy-booking-link]');
  if(box&&link){link.href=safe;box.hidden=false;}
  setMsg('Payment verified. Book your 30-minute session now. Redirecting you to the booking page...');
  setTimeout(()=>{window.location.assign(safe);},2500);
  return true;
}

async function poll(orderHandle){
  for(let i=0;i<MAX_POLLS;i+=1){
    let s;try{s=await callable('getOrderStatus',{orderHandle},{auth:true});}catch{setMsg('We could not read your order right now. Use your newest sign-in link to resume.');return;}
    if(isRecord(s)&&typeof s.message==='string')setMsg(s.message);
    if(isRecord(s)&&s.bookingUrl&&showBooking(s.bookingUrl))return;
    if(isRecord(s)&&['cancelled','manual_support'].includes(s.status))return;
    await new Promise(r=>setTimeout(r,POLL_MS));
  }
  setMsg('Still waiting on payment verification. Pay the QuickBooks invoice from your email, then reopen your newest sign-in link here.');
}

async function completeReturn(params){
  const email=localStorage.getItem(EMAIL_KEY)||window.prompt('Confirm the email address you used:')||'';
  const rt=await runtime();if(!rt)return closed();
  try{await rt.completeEmailLink({email});}catch{setMsg('That sign-in link is expired or was already used. Request a new one below.');return;}
  let orderHandle=params.get('order');
  if(!orderHandle){
    const customerName=(localStorage.getItem(NAME_KEY)||'').trim()||email.split('@')[0];
    try{
      const created=await callable('createDigitalOrder',{sku:SKU,customerName,idempotencyKey:crypto.randomUUID()},{auth:true});
      orderHandle=created.orderHandle;
      const u=new URL(window.location.href);u.search='';u.searchParams.set('sku',SKU);u.searchParams.set('order',orderHandle);history.replaceState(null,'',u);
      setMsg('Your QuickBooks invoice for $100 (tax included) is on its way to your email. Pay it there; this page will send you to booking once payment is verified.');
    }catch{setMsg('Checkout is not available right now. No invoice was created.');return;}
  }
  await poll(orderHandle);
}

async function init(){
  closed();
  const params=new URLSearchParams(window.location.search);
  let active=false;
  try{const cap=await callable('getBuyerCommerceCapability',{});active=Array.isArray(cap?.products)&&cap.products.some(p=>p?.sku===SKU&&p.active===true);}catch{active=false;}
  if(params.has('oobCode')){await completeReturn(params);return;}
  if(!active)return;
  const btn=$('[data-strategy-checkout]');const form=$('[data-strategy-form]');
  if(btn){btn.textContent='Pay $100 (tax included) & book';btn.removeAttribute('aria-disabled');btn.addEventListener('click',()=>{if(form){form.hidden=false;form.querySelector('input')?.focus();}});}
  form?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(form);const email=String(fd.get('email')||'').trim();const name=String(fd.get('customerName')||'').trim();
    if(!email||!name)return;localStorage.setItem(EMAIL_KEY,email);localStorage.setItem(NAME_KEY,name);
    const resume=params.get('order');
    try{await callable('requestPilotSignInLink',resume?{email,sku:SKU,orderHandle:resume}:{email,sku:SKU});}catch{/* indistinguishable */}
    setMsg('Check your email for a secure sign-in link. Open it on this device to receive your $100 QuickBooks invoice.');
  });
}
if(typeof document!=='undefined')init();

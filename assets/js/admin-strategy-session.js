// Owner/admin-only: verify the QuickBooks item for the Strategy Session.
// Server enforces App Check plus admin:true or the configured owner email; this page grants nothing.
const FUNCTION_ORIGIN='https://us-west1-the-ballers-kingdom.cloudfunctions.net';
const EMAIL_KEY='bk-owner-admin-email';
function $(s){return document.querySelector(s);}
function out(text){$('[data-admin-output]').textContent=text;}
async function runtime(){const r=window.__BALLERS_FIREBASE_RUNTIME_READY__;if(r&&r.then){try{await r;}catch{return null;}}return window.__BALLERS_FIREBASE_RUNTIME__||null;}
async function callable(name,data,{auth=false}={}){
  const rt=await runtime();if(!rt)throw new Error('Firebase is unavailable');
  const headers={'Content-Type':'application/json','X-Firebase-AppCheck':await rt.getAppCheckToken()};
  if(auth)headers.Authorization=`Bearer ${await rt.getIdToken()}`;
  const res=await fetch(`${FUNCTION_ORIGIN}/${name}`,{method:'POST',headers,body:JSON.stringify({data}),credentials:'omit',referrerPolicy:'no-referrer'});
  const env=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(env?.error?.message||`Request failed (${res.status})`);
  return env.data;
}
async function init(){
  const params=new URLSearchParams(location.search);
  const signIn=$('[data-admin-signin]');const actions=$('[data-admin-actions]');
  signIn.addEventListener('submit',async e=>{e.preventDefault();const email=String(new FormData(signIn).get('email')||'').trim();if(!email)return;localStorage.setItem(EMAIL_KEY,email);
    try{await callable('requestPilotSignInLink',{email,sku:'owner-admin'});}catch{}
    out('If this is the owner address, a sign-in link was emailed. Open it on this device.');});
  if(!params.has('oobCode'))return;
  const rt=await runtime();const email=localStorage.getItem(EMAIL_KEY)||prompt('Confirm your owner email:')||'';
  try{await rt.completeEmailLink({email});}catch{out('Sign-in link expired or already used. Request a new one.');return;}
  signIn.hidden=true;actions.hidden=false;out('Signed in. Click the button to create or read back the QuickBooks item.');
  $('[data-admin-ensure]').addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;out('Working...');
    try{const r=await callable('ensureStrategySessionItem',{},{auth:true});
      if(r?.status==='verified'){out(`Verified. QuickBooks item id ${r.readback.itemId}${r.readback.created?' (created now)':' (already existed)'}\n`+JSON.stringify(r.readback,null,2)+'\n\nCheckout opens automatically within about a minute.');}
      else if(r?.status==='qbo_reconnect_required'){out('QuickBooks must be reconnected. Click "Reconnect QuickBooks", sign in to Intuit, then come back and click Verify again.');$('[data-admin-reconnect]').hidden=false;}
      else out(`Not verified: ${r?.status||'unknown'}\n`+JSON.stringify(r?.readback??{},null,2));
    }catch(err){out(`Not allowed or failed: ${err.message}`);}finally{b.disabled=false;}});
  $('[data-admin-reconnect]').addEventListener('click',async()=>{try{const r=await callable('beginQuickBooksConnection',{},{auth:true});const u=new URL(r.url);if(u.origin!=='https://appcenter.intuit.com')throw new Error('Unexpected URL');location.assign(u.toString());}catch(err){out(`Reconnect failed: ${err.message}`);}});
}
init();

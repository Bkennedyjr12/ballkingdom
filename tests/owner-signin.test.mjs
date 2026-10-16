import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/admin-strategy-session.js',import.meta.url),'utf8');
function setup({fetchImpl,appCheckFailure=false}={}){
 let submit;const output={textContent:''};const button={disabled:false};const form={hidden:false,addEventListener(event,handler){if(event==='submit')submit=handler;},querySelector(){return button;}};const actions={hidden:true};let calls=0;
 const ctx={document:{querySelector(s){return {'[data-admin-signin]':form,'[data-admin-actions]':actions,'[data-admin-output]':output}[s];}},window:{__BALLERS_FIREBASE_RUNTIME__:{async getAppCheckToken(){if(appCheckFailure)throw Error('synthetic attestation failure');return 'synthetic-app-check';}}},location:{search:''},localStorage:{setItem(){},getItem(){return null;}},FormData:class{get(){return 'owner@example.test';}},URLSearchParams,URL,AbortController,setTimeout,clearTimeout,prompt:()=>'',fetch:async(...args)=>{calls++;return fetchImpl(...args);}};
 vm.runInNewContext(source,ctx);return {submit:()=>submit({preventDefault(){}}),output,button,get calls(){return calls;}};
}
test('transport failure never claims a sign-in email was sent',async()=>{const s=setup({fetchImpl:async()=>{throw new TypeError('Failed to fetch');}});await s.submit();assert.match(s.output.textContent,/failed|unavailable/i);assert.doesNotMatch(s.output.textContent,/was emailed|was sent/i);});
test('HTTP403 never claims a sign-in email was sent',async()=>{const s=setup({fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:{message:'denied'}})})});await s.submit();assert.match(s.output.textContent,/failed|unavailable/i);assert.doesNotMatch(s.output.textContent,/was emailed|was sent/i);});
test('App Check failure stops before email request and is visible',async()=>{const s=setup({appCheckFailure:true,fetchImpl:async()=>{throw Error('must not send');}});await s.submit();assert.equal(s.calls,0);assert.match(s.output.textContent,/failed|unavailable/i);});
test('valid callable result acknowledges request without asserting delivery',async()=>{const s=setup({fetchImpl:async()=>({ok:true,status:200,json:async()=>({result:{status:'request_received'}})})});await s.submit();assert.match(s.output.textContent,/request received/i);assert.doesNotMatch(s.output.textContent,/was emailed|was sent/i);assert.equal(s.button.disabled,false);});
test('rapid duplicate submits create one request and restore the control',async()=>{let finish;const pending=new Promise(resolve=>finish=resolve);const s=setup({fetchImpl:async()=>pending});const first=s.submit();const second=s.submit();assert.equal(s.button.disabled,true);finish({ok:true,status:200,json:async()=>({result:{status:'request_received'}})});await Promise.all([first,second]);assert.equal(s.calls,1);assert.equal(s.button.disabled,false);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkoutEmailLinkRuntime} from '../assets/js/workouts-email-link-runtime.js';
function fixture({linked=true,result='example@example.test',reject=false}={}){
 const calls=[];const auth={currentUser:null};
 const authSdk={isSignInWithEmailLink:()=>linked,signInWithEmailLink:async(a,email,href)=>{calls.push(['complete',email]);if(reject)throw Object.assign(new Error('sensitive provider details'),typeof reject==='string'?{code:reject}:{});auth.currentUser={email:result};return {user:auth.currentUser};},signOut:async()=>{calls.push(['signout']);auth.currentUser=null;},onAuthStateChanged:(a,fn)=>{fn(a.currentUser);return ()=>{};}};
 const firestoreSdk={getDocFromServer:()=>{},getDocsFromServer:()=>{}};
 const runtime=createWorkoutEmailLinkRuntime({auth,db:{},authSdk,firestoreSdk,location:{href:'https://ballkingdom.com/workouts?mode=signIn&oobCode=secret&apiKey=public&continueUrl=anything&lang=en&tenantId=test&view=week#sessions'},history:{replaceState:(a,b,url)=>calls.push(['clean',url])}});
 return {runtime,calls,auth};
}
test('import and construction do not initialize Auth, issue links, create accounts or call network',()=>{const {runtime,calls}=fixture();assert.equal(calls.length,0);assert.equal(typeof runtime.repository.loadPlan,'function');assert.equal(runtime.hasEmailLink(),true);});
test('matching verified email completes and removes all link action parameters, preserving unrelated navigation',async()=>{const {runtime,calls}=fixture();assert.deepEqual(await runtime.completeEmailLink({email:' Example@example.test '}),{signedIn:true});assert.deepEqual(calls,[['complete','Example@example.test'],['clean','https://ballkingdom.com/workouts?view=week#sessions']]);});
test('invalid link or empty email does not attempt signin',async()=>{for(const f of [fixture({linked:false}),fixture()]){await assert.rejects(f.runtime.completeEmailLink({email:f.runtime.hasEmailLink()?'':'example@example.test'}),/secure identity/);assert.equal(f.calls.length,0);}});
test('mismatched verified identity or failed signin clears the session and returns only a generic error',async()=>{for(const options of [{result:'other@example.test'},{reject:true}]){const f=fixture(options);await assert.rejects(f.runtime.completeEmailLink({email:'example@example.test'}),/^Error: Unable to complete the secure identity check\.$/);assert.equal(f.auth.currentUser,null);assert.equal(f.calls.at(-1)[0],'signout');assert.equal(f.calls.some(c=>c[0]==='clean'),false);}});

test('expired or consumed links are removed so a fresh link can be requested; typo failures preserve the link',async()=>{for(const code of ['auth/expired-action-code','auth/invalid-action-code']){const f=fixture({reject:code});await assert.rejects(f.runtime.completeEmailLink({email:'example@example.test'}),/Request a new link/);assert.equal(f.calls.some(c=>c[0]==='clean'),true);}const typo=fixture({reject:'auth/invalid-email'});await assert.rejects(typo.runtime.completeEmailLink({email:'example@example.test'}));assert.equal(typo.calls.some(c=>c[0]==='clean'),false);});

test('network failures give a safe actionable message without provider text',async()=>{const f=fixture({reject:'auth/network-request-failed'});await assert.rejects(f.runtime.completeEmailLink({email:'example@example.test'}),/^Error: Sign-in could not reach Firebase\. Check your connection and retry this link\.$/);});

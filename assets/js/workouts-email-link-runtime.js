import {createWorkoutRepository} from './workouts-repository.js';
const ACTION_PARAMETERS=['mode','oobCode','apiKey','continueUrl','lang','tenantId'];
const failure=()=>new Error('Unable to complete the secure identity check.');
// Inactive dependency-injected bridge. The caller supplies the existing initialized
// Auth session (in-memory persistence) and Firestore memory cache. No account,
// link issuance, SDK initialization, provider change, or network call on import.
export function createWorkoutEmailLinkRuntime({auth,db,authSdk,firestoreSdk,location,history}={}){
 if(!auth||!db||!authSdk||!firestoreSdk||!location||!history||['isSignInWithEmailLink','signInWithEmailLink','signOut','onAuthStateChanged'].some(name=>typeof authSdk[name]!=='function')||typeof firestoreSdk.getDocFromServer!=='function'||typeof firestoreSdk.getDocsFromServer!=='function')throw failure();
 return Object.freeze({
  repository:createWorkoutRepository({db,sdk:{...firestoreSdk,getDoc:firestoreSdk.getDocFromServer,getDocs:firestoreSdk.getDocsFromServer},currentUser:()=>auth.currentUser}),
  observe:fn=>authSdk.onAuthStateChanged(auth,fn),
  signOut:()=>authSdk.signOut(auth),
  hasEmailLink:()=>authSdk.isSignInWithEmailLink(auth,location.href)===true,
  async completeEmailLink({email}={}){
   let attempted=false;
   try{
    const normalized=typeof email==='string'?email.trim():'';
    if(!normalized||normalized.length>254||!authSdk.isSignInWithEmailLink(auth,location.href))throw failure();
    attempted=true;
    const result=await authSdk.signInWithEmailLink(auth,normalized,location.href);
    if(typeof result?.user?.email!=='string'||result.user.email.trim().toLowerCase()!==normalized.toLowerCase())throw failure();
    const clean=new URL(location.href);
    ACTION_PARAMETERS.forEach(key=>clean.searchParams.delete(key));
    history.replaceState(null,'',clean.toString());
    return Object.freeze({signedIn:true});
   }catch(error){
    const expired=['auth/expired-action-code','auth/invalid-action-code'].includes(error?.code);
    if(expired){const clean=new URL(location.href);ACTION_PARAMETERS.forEach(key=>clean.searchParams.delete(key));history.replaceState(null,'',clean.toString());}
    if(attempted)try{await authSdk.signOut(auth);}catch{}
    if(expired)throw new Error('This sign-in link has expired or was already used. Request a new link.');
    const messages={
     'auth/network-request-failed':'Sign-in could not reach Firebase. Check your connection and retry this link.',
     'auth/invalid-email':'Enter the same valid email address that received this link.',
     'auth/invalid-credential':'This link and email could not be verified together. Check the email address or request a fresh link.',
     'auth/operation-not-allowed':'Email-link sign-in is unavailable in Firebase. Please report this message.',
     'auth/too-many-requests':'Firebase has temporarily limited sign-in attempts. Wait before trying again.',
     'auth/invalid-api-key':'The sign-in configuration could not be verified. Please report this message.',
     'auth/app-not-authorized':'Firebase has not authorized this sign-in configuration. Please report this message.'
    };
    if(messages[error?.code])throw new Error(messages[error.code]);
    throw failure();
   }
  }
 });
}

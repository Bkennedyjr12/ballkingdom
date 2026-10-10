import {createWorkoutTrackingClient} from './workouts-tracking-client.js';
import {createWorkoutEmailLinkRuntime} from './workouts-email-link-runtime.js?v=signin-feedback-20261006';
// Activation requires approval of the live-based workout rules and email-link Auth setup.
export const WORKOUTS_ACTIVATED=true;
export const WORKOUT_FIREBASE_CONFIG=Object.freeze({projectId:'the-ballers-kingdom',appId:'1:78885961453:web:9f7beee5425137768a96e4',apiKey:'AIzaSyAaDpJxm-iOybCpsXio6cmW_JClPzq1lUw',authDomain:'the-ballers-kingdom.firebaseapp.com'});
export function createProductionWorkoutRuntime({enabled=false,appSdk,authSdk,firestoreSdk,location,history,trackingFactory=null,trackingClient=null,now=()=>Date.now()}={}){
 if(!enabled)throw new Error('Private sign-in and saving are awaiting the approved security update. You can still use the generic workout planner.');
 if(location?.origin!=='https://ballkingdom.com')throw new Error('Open the private notebook at https://ballkingdom.com/workouts.');
 if(!authSdk?.inMemoryPersistence||typeof firestoreSdk?.memoryLocalCache!=='function'||(!trackingClient&&typeof authSdk?.sendSignInLinkToEmail!=='function'))throw new Error('Private sign-in is unavailable.');
 const app=appSdk.initializeApp(WORKOUT_FIREBASE_CONFIG,'tbk-workout-notebook');
 const auth=authSdk.initializeAuth(app,{persistence:authSdk.inMemoryPersistence});
 const db=firestoreSdk.initializeFirestore(app,{localCache:firestoreSdk.memoryLocalCache()});
 if(trackingFactory)trackingClient=trackingFactory(app);
 const bridge=createWorkoutEmailLinkRuntime({auth,db,authSdk,firestoreSdk,location,history});
 let nextRequest=0,inFlight=false;
 return Object.freeze({...bridge,
  async signOut(){trackingClient?.clear();return bridge.signOut();},
  async completeEmailLink(input){const result=await bridge.completeEmailLink(input);if(trackingClient){try{await trackingClient.confirmSignIn();}catch{/* Authentication success is independent of optional tracking confirmation. */}}return result;},
  requestStatus:()=>trackingClient?trackingClient.requestStatus():Promise.reject(new Error('Delivery tracking is not active.')),
  async requestEmailLink(email){
  const normalized=typeof email==='string'?email.trim():'';
  if(normalized.length>254||!/^\S+@\S+\.\S+$/.test(normalized))throw new Error('Enter a valid email address.');
  if(inFlight||now()<nextRequest)throw new Error('Wait a minute before requesting another link.');
  inFlight=true;nextRequest=now()+60000;
  try{if(trackingClient)return await trackingClient.requestEmailLink(normalized);await authSdk.sendSignInLinkToEmail(auth,normalized,{url:'https://ballkingdom.com/workouts',handleCodeInApp:true});}
  catch(error){
   if(trackingClient)throw new Error('The tracked sign-in request could not be confirmed. Wait before trying again.');
   // Show non-enumerating operational failures; never echo provider text or email.
   if(error?.code==='auth/network-request-failed')throw new Error('The sign-in request could not be confirmed. Check your connection and try again in a minute.');
   if(['auth/too-many-requests','auth/quota-exceeded'].includes(error?.code))throw new Error('Sign-in email requests are temporarily limited. Wait and try again later.');
   if(['auth/operation-not-allowed','auth/unauthorized-domain','auth/invalid-continue-uri','auth/invalid-api-key','auth/app-not-authorized','auth/internal-error'].includes(error?.code))throw new Error('Email sign-in is temporarily unavailable. Your request was not confirmed.');
   // Account-specific outcomes remain indistinguishable. No error/input logging.
   if(!['auth/user-not-found','auth/user-disabled','auth/invalid-credential','auth/invalid-login-credentials','auth/email-already-in-use'].includes(error?.code))throw new Error('The sign-in request could not be confirmed. Please try again later.');
  }
  finally{inFlight=false;}
  return {status:'request_received'};
 }});
}
export async function productionRuntime(){
 if(!WORKOUTS_ACTIVATED)return createProductionWorkoutRuntime();
 const [appSdk,authSdk,firestoreSdk,functionsSdk,appCheckSdk]=await Promise.all([import('../vendor/workouts/firebase-app.js'),import('../vendor/workouts/firebase-auth.js'),import('../vendor/workouts/firebase-firestore.js'),import('../vendor/workouts/firebase-functions.js'),import('../vendor/workouts/firebase-app-check.js')]);
 return createProductionWorkoutRuntime({enabled:true,appSdk,authSdk,firestoreSdk,location:window.location,history:window.history,trackingFactory:app=>{
  appCheckSdk.initializeAppCheck(app,{provider:new appCheckSdk.ReCaptchaEnterpriseProvider('6LfY_GQtAAAAAHbwGeII_U4bf8YNWHUMu5OkoS2I'),isTokenAutoRefreshEnabled:true});
  return createWorkoutTrackingClient({functions:functionsSdk.getFunctions(app,'us-west1'),httpsCallable:functionsSdk.httpsCallable,randomBytes:size=>crypto.getRandomValues(new Uint8Array(size)),location:window.location});
 }});
}
export function friendlyError(error){
 if(error?.code==='permission-denied')return 'Access is unavailable. Check your coach permission or sign in to the correct account.';
 if(['auth/network-request-failed','unavailable','deadline-exceeded'].includes(error?.code))return 'Connection unavailable. Keep your draft open and retry.';
 return error?.code?'Unable to complete this action. Check your connection and use the newest sign-in link.':error?.message||'Unable to complete this action.';
}

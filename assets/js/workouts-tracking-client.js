// Candidate client transport; not bound to production until endpoint approval.
// App Check must already be initialized on the named workout Firebase app.
export function createWorkoutTrackingClient({functions,httpsCallable,randomBytes,location}={}){
 if(!functions||typeof httpsCallable!=='function'||typeof randomBytes!=='function')throw Error('Tracking unavailable');
 const call=name=>httpsCallable(functions,name),request=call('requestWorkoutSignInLink'),status=call('getWorkoutSignInRequestStatus'),confirm=call('confirmWorkoutSignIn');
 const hex=size=>Array.from(randomBytes(size),n=>n.toString(16).padStart(2,'0')).join('');
 let attempt=null;
 return Object.freeze({
  async requestEmailLink(email){
   const pending={requestId:hex(16),statusToken:hex(32)};
   const response=await request({email,...pending});const result=response?.data;
   if(result?.requestId!==pending.requestId||result?.statusToken!==pending.statusToken||!['provider_accepted','request_received','temporarily_limited','request_unconfirmed'].includes(result?.status))throw Error('Sign-in request unconfirmed');
   attempt=pending;
   if(result.status==='temporarily_limited')throw Error('Sign-in requests are temporarily limited. Wait before trying again.');
   if(result.status==='request_unconfirmed')throw Error('The sign-in request could not be confirmed. Please try again later.');
   return {status:result.status,delivery:result.delivery};
  },
  async requestStatus(){if(!attempt)throw Error('Status unavailable in this browser session');const result=await status(attempt);return result.data;},
  async confirmSignIn(){const id=new URL(location.href).searchParams.get('requestId');if(!/^[a-f0-9]{32}$/.test(id||''))return {status:'confirmation_unavailable'};const result=await confirm({requestId:id});return result.data;},
  clear(){attempt=null;}
 });
}

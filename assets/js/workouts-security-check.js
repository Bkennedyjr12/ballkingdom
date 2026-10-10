const button=document.getElementById('verify'),result=document.getElementById('result');
button.addEventListener('click',async()=>{
 if(location.origin!=='https://ballkingdom.com'){result.textContent='This check must run at https://ballkingdom.com.';return;}
 button.disabled=true;result.textContent='Checking this browser…';
 try{
  const [appSdk,checkSdk]=await Promise.all([import('../vendor/workouts/firebase-app.js'),import('../vendor/workouts/firebase-app-check.js')]);
  const app=appSdk.initializeApp({projectId:'the-ballers-kingdom',appId:'1:78885961453:web:9f7beee5425137768a96e4',apiKey:'AIzaSyAaDpJxm-iOybCpsXio6cmW_JClPzq1lUw'},'tbk-workout-security-check');
  const check=checkSdk.initializeAppCheck(app,{provider:new checkSdk.ReCaptchaEnterpriseProvider('6LfY_GQtAAAAAHbwGeII_U4bf8YNWHUMu5OkoS2I'),isTokenAutoRefreshEnabled:false});
  const response=await checkSdk.getToken(check,false);
  result.textContent=response?.token?'Success: this browser passed App Check.':'Error: verification was not confirmed.';
 }catch(error){const codes=['appCheck/initial-throttle','appCheck/throttled','appCheck/fetch-network-error','appCheck/fetch-status-error','appCheck/recaptcha-error'];result.textContent='Error: '+(codes.includes(error?.code)?error.code:'verification unavailable')+'. No email was sent.';}
});

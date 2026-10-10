// A slow write remains pending: elapsed time does not cancel a Firebase operation.
export async function confirmedAction(action,{onPending=()=>{},delay=6000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const timer=setTimer(onPending,delay);
 try{return await action();}finally{clearTimer(timer);}
}

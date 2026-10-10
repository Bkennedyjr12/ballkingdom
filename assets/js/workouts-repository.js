// Authenticated SDK boundary. The caller initializes Firebase; server rules authorize every access.
import {createDraft,updateSession} from './workouts-model.js';
import {buildSuggestedWeek} from './workouts-options.js';
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export function createWorkoutRepository({db,sdk,currentUser}={}){
 function uid(){const user=currentUser?.();if(!validId(user?.uid))throw new Error('Sign in before opening your workout notebook.');return user.uid;}
 function path(planId,ownerUid=uid()){if(!validId(planId)||planId.length>80||!validId(ownerUid))throw new Error('Choose a valid plan reference.');uid();return `workoutUsers/${ownerUid}/plans/${planId}`;}
 function grantPath(ownerUid,coachUid){if(!validId(ownerUid)||!validId(coachUid))throw new Error('Choose a valid coach ID.');uid();return `workoutUsers/${ownerUid}/coachGrants/${coachUid}`;}
 async function nested(base){const [sessions,checkins]=await Promise.all(['sessions','checkins'].map(name=>sdk.getDocs(sdk.collection(db,`${base}/${name}`))));const records=[...sessions.docs,...checkins.docs];if(records.length>450)throw new Error('This record needs a bounded server cleanup before deletion.');return records;}
 return Object.freeze({
  async listPlans(){const result=await sdk.getDocs(sdk.query(sdk.collection(db,`workoutUsers/${uid()}/plans`),sdk.orderBy('updatedAt','desc'),sdk.limit(20)));return result.docs.map(d=>({id:d.id,...d.data()}));},
  async saveDraft(planId,draft){
   const base=path(planId);if(draft?.status!=='draft')throw new Error('Create a revision to edit a reviewed plan.');
   const clean=createDraft(draft.intake);if(!Array.isArray(draft.sessions)||draft.sessions.length!==clean.sessions.length)throw new Error('Sessions must match selected days.');
   const seen=new Set();for(const session of draft.sessions){if(seen.has(session.id))throw new Error('Session IDs must be unique.');seen.add(session.id);for(const field of ['title','minutes','details','status','notes'])clean.sessions=updateSession(clean,session.id,field,session[field]).sessions;clean.sessions=updateSession(clean,session.id,'shortOption',session.shortOption||'').sessions;clean.sessions=updateSession(clean,session.id,'exercises',session.exercises||[]).sessions;}
   const previousPlanId=draft.previousPlanId||'';let preferences={};if(draft.preferences&&Object.keys(draft.preferences).length){preferences=buildSuggestedWeek({...draft.intake,...draft.preferences,days:draft.preferences.availableDays}).preferences;if(clean.intake.days.some(day=>!preferences.availableDays.includes(day)))throw new Error('Scheduled days must match availability.');}const recommendation=String(draft.recommendation||'');if(recommendation.length>1000)throw new Error('Recommendation is too long.');if(previousPlanId&&!validId(previousPlanId))throw new Error('Choose a valid previous version.');
   const existing=await sdk.getDoc(sdk.doc(db,base));if(existing.exists()&&existing.data().status!=='draft')throw new Error('Create a revision to edit a reviewed plan.');
   const stale=existing.exists()?await nested(base):[];const batch=sdk.writeBatch(db);
   batch.set(sdk.doc(db,base),{schemaVersion:1,ownerUid:uid(),weekStart:clean.intake.weekStart,displayName:clean.intake.displayName,goal:clean.intake.goal,equipment:clean.intake.equipment,experience:clean.intake.experience,availableMinutes:clean.intake.minutes,sessionIds:clean.sessions.map(s=>s.id),status:'draft',previousPlanId,preferences,recommendation,updatedAt:sdk.serverTimestamp()});
   for(const record of stale)if(!seen.has(record.id))batch.delete(record.ref);
   for(const session of clean.sessions){batch.set(sdk.doc(db,`${base}/sessions/${session.id}`),{id:session.id,day:session.day,title:session.title,minutes:session.minutes,details:session.details,shortOption:session.shortOption||'',exercises:session.exercises||[],updatedAt:sdk.serverTimestamp()});batch.set(sdk.doc(db,`${base}/checkins/${session.id}`),{participantUid:uid(),sessionId:session.id,status:session.status,notes:session.notes,updatedAt:sdk.serverTimestamp()});}
   await batch.commit();return {saved:true,id:planId};
  },
  async loadPlan(planId,{ownerUid=uid()}={}){
   const base=path(planId,ownerUid);const snapshot=await sdk.getDoc(sdk.doc(db,base));if(!snapshot.exists())return null;const meta=snapshot.data();
   const sessions=await Promise.all(meta.sessionIds.map(async id=>{const session=await sdk.getDoc(sdk.doc(db,`${base}/sessions/${id}`));if(!session.exists())throw new Error('This plan is incomplete.');let log={status:'planned',notes:''};
    if(ownerUid===uid()){const checkin=await sdk.getDoc(sdk.doc(db,`${base}/checkins/${id}`));if(checkin.exists())log=checkin.data();}
    else{const grant=await sdk.getDoc(sdk.doc(db,grantPath(ownerUid,uid())));if(grant.exists()&&grant.data().status==='active'&&grant.data().readCheckins){const checkin=await sdk.getDoc(sdk.doc(db,`${base}/checkins/${id}`));if(checkin.exists())log=checkin.data();}}
    const value=session.data();return {id:value.id,day:value.day,title:value.title,minutes:value.minutes,details:value.details,shortOption:value.shortOption||'',exercises:value.exercises||[],status:log.status,notes:log.notes};}));
   return {schemaVersion:1,ownerUid,status:meta.status,previousPlanId:meta.previousPlanId||'',preferences:meta.preferences||{},recommendation:meta.recommendation||'',intake:{displayName:meta.displayName||'',goal:meta.goal,equipment:meta.equipment,experience:meta.experience,minutes:meta.availableMinutes,weekStart:meta.weekStart,days:sessions.map(s=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(s.day))},sessions};
  },
  async saveCheckin(planId,sessionId,{status,notes}={}){const base=path(planId);if(!/^\d{4}-\d{2}-\d{2}$/.test(sessionId)||!['planned','completed','skipped'].includes(status)||typeof notes!=='string'||notes.length>1000)throw new Error('Enter a valid check-in.');await sdk.setDoc(sdk.doc(db,`${base}/checkins/${sessionId}`),{participantUid:uid(),sessionId,status,notes,updatedAt:sdk.serverTimestamp()});return {saved:true};},
  async saveCoachSession(ownerUid,planId,session){const base=path(planId,ownerUid);if(!/^\d{4}-\d{2}-\d{2}$/.test(session.id))throw new Error('Invalid session.');await sdk.updateDoc(sdk.doc(db,`${base}/sessions/${session.id}`),{title:session.title,minutes:session.minutes,details:session.details,shortOption:session.shortOption||'',exercises:session.exercises||[],updatedAt:sdk.serverTimestamp()});return {saved:true};},
  async reviewPlan(ownerUid,planId){const base=path(planId,ownerUid);const plan=await sdk.getDoc(sdk.doc(db,base));if(plan.exists()&&plan.data().status==='reviewed')return {reviewed:true};await sdk.updateDoc(sdk.doc(db,base),{status:'reviewed',updatedAt:sdk.serverTimestamp()});return {reviewed:true};},
  async setCoachGrant(coachUid,{status='active',readPlan,editPlan,readCheckins}){await sdk.setDoc(sdk.doc(db,grantPath(uid(),coachUid)),{coachUid,status,readPlan:readPlan===true,editPlan:editPlan===true,readCheckins:readCheckins===true,updatedAt:sdk.serverTimestamp()});return {saved:true};},
  async getCoachGrant(ownerUid,coachUid=uid()){const doc=await sdk.getDoc(sdk.doc(db,grantPath(ownerUid,coachUid)));return doc.exists()?doc.data():null;},
  watchCoachGrant(ownerUid,callback,onError){return sdk.onSnapshot(sdk.doc(db,grantPath(ownerUid,uid())),snapshot=>callback(snapshot.exists()?snapshot.data():null),onError);},
  async deletePlan(planId){const base=path(planId);const records=await nested(base);const batch=sdk.writeBatch(db);for(const record of records)batch.delete(record.ref);batch.delete(sdk.doc(db,base));await batch.commit();return {deleted:true};}
 });
}

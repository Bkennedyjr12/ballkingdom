import {sessionSummary} from './workouts-session-summary.js';
import {exerciseOptions} from './workouts-exercises.js';
import {createDraft,DAYS} from './workouts-model.js';
export const STYLES=Object.freeze(['strength','bodyweight','dumbbell','walking','running','lowImpact']);
export const SETTINGS=Object.freeze(['home','apartmentGym','commercialGym','outdoor','travel']);
export const EQUIPMENT=Object.freeze(['mat','bands','dumbbells','barbell','treadmill','bike','chair']);
export const CONSTRAINTS=Object.freeze(['avoidImpact','noFloor','quietSpace','limitedSpace']);
const names={strength:'Strength movement practice',bodyweight:'Bodyweight movement practice',dumbbell:'Dumbbell movement practice',walking:'Walking',running:'Running',lowImpact:'Low-impact movement'};
const unique=value=>[...new Set(value)];
function selection(value,allowed,label){if(!Array.isArray(value)||value.some(v=>!allowed.includes(v)))throw new Error(`Choose valid ${label}.`);return unique(value);}
function viable(style,p){
 if(style==='dumbbell')return p.equipmentCodes.includes('dumbbells');
 if(style==='running')return !p.constraints.includes('avoidImpact')&&(p.setting==='outdoor'||p.equipmentCodes.includes('treadmill'));
 if(style==='walking')return !p.constraints.includes('limitedSpace')||p.setting==='outdoor'||p.equipmentCodes.includes('treadmill');
 return true;
}
function spaced(days,count){const result=[days[0]];while(result.length<count){const rest=days.filter(day=>!result.includes(day));rest.sort((a,b)=>{const distance=d=>Math.min(...result.map(s=>Math.min(Math.abs(d-s),7-Math.abs(d-s))));return distance(b)-distance(a)||a-b;});result.push(rest[0]);}return result.sort((a,b)=>a-b);}
export function buildSuggestedWeek(input){
 const style=input.style,setting=input.setting,requestedDays=Number(input.requestedDays);
 if(!STYLES.includes(style)||!SETTINGS.includes(setting))throw new Error('Choose a workout style and training setting.');
 const availableDays=selection(input.days,[0,1,2,3,4,5,6],'available days').sort((a,b)=>a-b);
 if(!Number.isInteger(requestedDays)||requestedDays<1||requestedDays>7||requestedDays>availableDays.length)throw new Error('Choose enough available days for your requested sessions per week.');
 const equipmentCodes=selection(input.equipmentCodes||[],EQUIPMENT,'equipment');const constraints=selection(input.constraints||[],CONSTRAINTS,'practical constraints');const alternativeStyles=selection(input.alternativeStyles||[],STYLES,'alternative styles');
 const preferences={style,setting,requestedDays,availableDays,equipmentCodes,constraints,alternativeStyles};
 const selectedStyle=[style,...alternativeStyles].find(candidate=>viable(candidate,preferences));
 if(!selectedStyle)throw new Error('Your preferred style does not fit the available equipment, setting, or impact preference. Select a workable alternative or update those answers.');
 const days=spaced(availableDays,requestedDays);const draft=createDraft({...input,days});draft.preferences=preferences;
 const minutes=Math.min(45,draft.intake.minutes);let lastTrainingDay=-10;
 for(const session of draft.sessions){const day=DAYS.indexOf(session.day),recovery=['strength','bodyweight','dumbbell','running'].includes(selectedStyle)&&((day-lastTrainingDay===1)||(day===6&&days.includes(0)));
  const current=recovery?'lowImpact':selectedStyle;if(!recovery)lastTrainingDay=day;
  session.exercises=exerciseOptions(current,preferences,draft.intake.experience,minutes);session.minutes=minutes;session.title=recovery?'Recovery and mobility':names[current];
  session.details=sessionSummary(session)+(recovery?' A recovery option spaces the more demanding sessions.':'');
  const shortMinutes=Math.min(10,minutes);session.shortOption=`If the full session does not fit: use up to ${shortMinutes} available minutes for a familiar comfortable part of this session. Record what you did; a shorter check-in still counts.`;
 }
 draft.recommendation=`${selectedStyle===style?'Your selected style':'An allowed '+names[selectedStyle].toLowerCase()+' alternative'} fits your stated equipment, setting, and available days. ${days.length} sessions fit the selected days;${draft.intake.minutes>45?' starter options use up to 45 minutes within your longer available window;':''} consecutive demanding options include recovery. Suggestions are editable general fitness options, not medical prescriptions.`;
 return draft;
}
export function rescheduleSession(draft,id,day){
 if(draft.status!=='draft')throw new Error('Create a revision to reschedule a reviewed plan.');
 const allowed=draft.preferences?.availableDays||draft.intake.days;
 if(!Number.isInteger(day)||!allowed.includes(day))throw new Error('Choose one of your available days.');
 const existing=draft.sessions.find(s=>s.id===id);if(!existing)throw new Error('Session not found.');if(existing.status==='completed')throw new Error('Keep completed sessions on their recorded day; create a revision for a new schedule.');
 const date=new Date(draft.intake.weekStart+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+day);const nextId=date.toISOString().slice(0,10);
 if(nextId!==id&&draft.sessions.some(s=>s.id===nextId))throw new Error('That day already has a session. Choose another available day.');
 const sessions=draft.sessions.map(s=>s.id===id?{...s,id:nextId,day:DAYS[day],status:'planned',notes:''}:s).sort((a,b)=>a.id.localeCompare(b.id));
 return {...draft,intake:{...draft.intake,days:sessions.map(s=>DAYS.indexOf(s.day))},sessions};
}

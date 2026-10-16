// Calendar-day projection only. Journal text remains in its existing device store.
export const DAILY_KEY='bk_daily_game_log_v1';
export const LINKS_KEY='bk_workout_daily_links_v1';
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function weekStart(date){if(!validDate(date))throw new Error('Choose a valid calendar date.');const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
export function addDays(date,count){if(!validDate(date)||!Number.isInteger(count))throw new Error('Choose a valid calendar day.');const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
export function emptyLinks(){return {version:1,plans:{}};}
export function validateLinks(value){if(!value||value.version!==1||!value.plans||Array.isArray(value.plans)||typeof value.plans!=='object'||Object.keys(value).some(k=>!['version','plans'].includes(k))||Object.keys(value.plans).length>200)throw new Error('Local workout links are unavailable. Existing journal data has not been changed.');for(const [key,sessions]of Object.entries(value.plans))validatePlan(key,sessions);return value;}
function validatePlan(key,sessions){if(typeof key!=='string'||!/^([a-zA-Z0-9_-]+:){1,2}[a-zA-Z0-9_-]+$/.test(key)||key.length>240||!Array.isArray(sessions)||sessions.length>7||sessions.some(s=>!s||Object.keys(s).some(k=>!['id','date','status'].includes(k))||!validDate(s.id)||!validDate(s.date)||s.date!==s.id||!['planned','completed','skipped'].includes(s.status))||new Set(sessions.map(s=>s.id)).size!==sessions.length)throw new Error('Use valid workout references, calendar dates and completion states.');}
export function replaceLinkedPlan(value,key,sessions){validateLinks(value);const minimal=sessions.map(s=>({id:s.id,date:s.id,status:s.status}));validatePlan(key,minimal);const next={version:1,plans:{...value.plans,[key]:minimal}};return validateLinks(next);}
export function unlinkPlan(value,key){validateLinks(value);const plans={...value.plans};delete plans[key];return {version:1,plans};}
export function workoutDates(value){validateLinks(value);return new Set(Object.values(value.plans).flat().filter(s=>s.status==='completed').map(s=>s.date));}
export function connectedCount(value,date){validateLinks(value);return Object.values(value.plans).flat().filter(s=>s.status==='completed'&&s.date===date).length;}
export function projectedLog(journal=[],links=emptyLinks()){
 if(!Array.isArray(journal))throw new Error('Your device journal is unavailable. Nothing has been replaced.');const entries=new Map();for(const entry of journal){if(entry&&validDate(entry.date))entries.set(entry.date,{...entry});}
 for(const date of workoutDates(links)){const entry=entries.get(date)||{date};entries.set(date,{...entry,physical:true});}
 return [...entries.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function weekSummary(journal,links,date){const start=weekStart(date),end=addDays(start,6),days=workoutDates(links);const entries=projectedLog(journal,links).filter(e=>e.date>=start&&e.date<=end);return {start,end,workoutDays:[...days].filter(d=>d>=start&&d<=end).length,physicalDays:entries.filter(e=>e.physical).length,allThree:entries.filter(e=>e.spiritual&&e.physical&&e.relational).length,daysEngaged:entries.length};}

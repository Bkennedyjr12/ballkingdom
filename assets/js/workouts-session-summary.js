import {EXERCISES} from './workouts-exercises.js';
export function sessionSummary(session){
 const cards=(session.exercises||[]).map(target=>{const name=EXERCISES[target.id]?.name||'Exercise unavailable';return `${name}: ${target.sets} set${target.sets===1?'':'s'}, ${target.reps}, rest ${target.restSeconds} sec`;});
 return `Available window: up to ${session.minutes} minutes, not a prescribed duration. ${cards.length?'Listed work: '+cards.join('; ')+'.':'No exercise targets are listed.'} Follow the card targets; no extra sets or repetitions are implied to fill the window. Actual time varies with pace and rests; you may finish sooner.`;
}
export function displayedSessionDetails(session){
 // Replace only the old generated template for display. Saved data and custom notes stay untouched.
 return /^(?:Editable options based on your .* setting and \d+-minute window\.|Available window: up to \d+ minutes, not a prescribed duration\.)/.test(session.details||'')?sessionSummary(session):session.details;
}
export function cleanWorkoutPrintUrl({location,history,authenticated=false}){
 if(!authenticated)return;
 const clean=new URL(location.href);clean.search='';clean.hash='';history.replaceState(null,'',clean.toString());
}

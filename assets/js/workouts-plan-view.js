import {EXERCISES,validateExercises} from './workouts-exercises.js';
import {videoFor} from './workouts-videos.js';
const node=(tag,text='',className='')=>{const value=document.createElement(tag);value.textContent=text;if(className)value.className=className;return value;};
export function renderPlanCover(target,draft){target.replaceChildren();target.hidden=!draft;if(!draft)return;const logo=node('img');logo.src='../../assets/img/logo-nav-white.png';logo.alt='The Ballers Kingdom';target.append(logo,node('h2',draft.intake.displayName?`${draft.intake.displayName}’s training week`:'Your training week'),node('p',`Week of ${draft.intake.weekStart} · ${draft.status==='reviewed'?'Coach reviewed':'Draft · Needs coach review'}`),node('p',draft.intake.goal),node('p','General fitness options. Example targets are editable; choose familiar appropriate movements with your coach. Completion notes are excluded from printing.','helper'));}
export function renderExercises(session,{editable=false,onChange=()=>{},catalog}={}){
 const list=node('div','','exercise-list');
 for(const [index,target]of (session.exercises||[]).entries()){
  const exercise=EXERCISES[target.id];const card=node('section','','exercise-card');
  if(!exercise){card.append(node('h4','Exercise unavailable'),node('p','This exercise ID is not in the reviewed catalog. Ask your coach for a matching option.'));list.append(card);continue;}
  card.append(node('h4',exercise.name),node('p',`${exercise.variant} · ${exercise.difficulty}`,'variant'));
  const fields=node('div','','exercise-targets'),printed=node('p',`${target.sets} set${target.sets===1?'':'s'} · ${target.reps} · Rest ${target.restSeconds} sec`,'print-values');
  for(const [key,label,type]of [['sets','Sets','number'],['reps','Reps / time','text'],['restSeconds','Rest (sec)','number']]){
   const wrap=node('label',label),input=node('input');input.type=type;input.value=target[key];input.disabled=!editable;input.setAttribute('aria-label',`${exercise.name} ${label}`);input.dataset.exerciseField=key;
   if(type==='number'){input.min=key==='sets'?'1':'0';input.max=key==='sets'?'5':'300';input.step='1';}else input.maxLength=30;
   input.addEventListener('input',()=>input.setCustomValidity(''));
   input.addEventListener('change',()=>{try{const next=session.exercises.map((t,i)=>i===index?{...t,[key]:type==='number'?Number(input.value):input.value}:t);validateExercises(next);onChange(next);session.exercises=next;const changed=next[index];printed.textContent=`${changed.sets} set${changed.sets===1?'':'s'} · ${changed.reps} · Rest ${changed.restSeconds} sec`;input.setCustomValidity('');}catch(error){input.setCustomValidity(error.message);input.reportValidity();}});wrap.append(input);fields.append(wrap);
  }
  card.append(fields,printed,node('p',exercise.cue),node('p','Alternative: '+exercise.alternative,'helper'));
  const video=videoFor(target.id,exercise.variant,exercise.difficulty,catalog);
  if(video){const link=node('a',`Watch ${exercise.name} on YouTube`);link.href=video.url;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';card.append(link,node('p',`${video.title} — ${video.provider}. Metadata checked ${video.verifiedOn}; playback unverified.`,'video-source'),node('p','Opens YouTube in a new tab. YouTube receives your visit; no plan details are added to the link.','helper third-party-notice'));}
  else card.append(node('p','No confirmed matching demonstration is available. Use the written cue or ask your coach; no substitute video is guessed.','video-source'));
  list.append(card);
 }
 if(!(session.exercises||[]).length)list.append(node('p','No exercise cards saved for this session. Create a new draft revision to add preference-based options.','helper'));
 return list;
}

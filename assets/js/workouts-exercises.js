// Stable exercise IDs distinguish exact variants. No inferred title matching.
export const EXERCISES=Object.freeze({
 chairSquat:{name:'Chair squat',variant:'Bodyweight chair squat',difficulty:'Foundation',equipment:['chair'],floor:false,cue:'Use a stable chair; control the sit and stand.',alternative:'Use a shallower familiar range or ask your coach for another standing option.'},
 wallPushup:{name:'Wall push-up',variant:'Standing wall push-up',difficulty:'Foundation',equipment:[],floor:false,cue:'Hands on a stable wall; keep the movement controlled.',alternative:'Stand closer to the wall or choose comfortable standing mobility.'},
 inclinePushup:{name:'Incline push-up',variant:'Hands-elevated incline push-up',difficulty:'Familiar technique',equipment:[],floor:false,cue:'Use only a secure, stable raised surface.',alternative:'Wall push-up.'},
 supportedDbRow:{name:'Supported dumbbell row',variant:'Single-arm supported dumbbell row',difficulty:'Familiar technique',equipment:['dumbbells','chair'],floor:false,cue:'Use stable support; move a familiar appropriate load with control.',alternative:'Omit resistance and choose familiar standing movement.'},
 gluteBridge:{name:'Glute bridge',variant:'Bodyweight floor glute bridge',difficulty:'Foundation',equipment:['mat'],floor:true,cue:'Use a comfortable floor position and controlled motion.',alternative:'Standing mobility if floor work does not fit.'},
 deadBug:{name:'Dead bug',variant:'Floor dead bug',difficulty:'Familiar technique',equipment:['mat'],floor:true,cue:'Move slowly through a familiar comfortable range.',alternative:'Standing mobility without floor work.'},
 dbHinge:{name:'Dumbbell Romanian deadlift',variant:'Standing dumbbell RDL',difficulty:'Familiar technique',equipment:['dumbbells'],floor:false,cue:'Practice only an already familiar hinge with an appropriate load.',alternative:'Chair squat if a stable chair is available.'},
 supportedSplitSquat:{name:'Supported split squat',variant:'Supported split squat',difficulty:'Familiar technique',equipment:['chair'],floor:false,cue:'Use a stable support and a familiar stance.',alternative:'Chair squat.'},
 dbFloorPress:{name:'Dumbbell floor press',variant:'Supine dumbbell floor press',difficulty:'Familiar technique',equipment:['dumbbells','mat'],floor:true,cue:'Set up safely on the floor with a familiar appropriate load.',alternative:'Wall push-up.'},
 birdDog:{name:'Bird dog',variant:'Quadruped bird dog',difficulty:'Foundation',equipment:['mat'],floor:true,cue:'Use a comfortable hands-and-knees position and controlled reach.',alternative:'Standing mobility.'},
 standingMobility:{name:'Standing mobility',variant:'Familiar standing movement',difficulty:'Self-selected',equipment:[],floor:false,cue:'Choose familiar comfortable movements, with room to move.',alternative:'Shorter comfortable movement break.'},
 walking:{name:'Walking',variant:'Self-selected walking',difficulty:'Self-selected',equipment:[],floor:false,cue:'Choose a suitable safe space and familiar comfortable pace.',alternative:'Standing movement in a suitable space.'},
 running:{name:'Running',variant:'Familiar running routine',difficulty:'Familiar technique',equipment:[],floor:false,cue:'Use your familiar appropriate routine in a suitable setting.',alternative:'Walking, if selected as an allowed alternative.'}
});
export const EXERCISE_IDS=Object.freeze(Object.keys(EXERCISES));
export function validateExercises(value=[]){
 if(!Array.isArray(value)||value.length>4)throw new Error('Use up to four exercise options per session.');
 const seen=new Set();return value.map(item=>{if(!item||Object.keys(item).some(k=>!['id','sets','reps','restSeconds'].includes(k))||!EXERCISES[item.id]||seen.has(item.id)||!Number.isInteger(item.sets)||item.sets<1||item.sets>5||typeof item.reps!=='string'||!item.reps.trim()||item.reps.length>30||!Number.isInteger(item.restSeconds)||item.restSeconds<0||item.restSeconds>300)throw new Error('Choose a known exercise, 1–5 sets, a short rep/time target and 0–300 seconds rest.');seen.add(item.id);return {id:item.id,sets:item.sets,reps:item.reps,restSeconds:item.restSeconds};});
}
export function exerciseOptions(style,p,experience,minutes){
 let ids;
 if(['walking','running','lowImpact'].includes(style))ids=[style==='lowImpact'?'standingMobility':style];
 else if(style==='dumbbell')ids=[p.equipmentCodes.includes('chair')?'supportedDbRow':'dbHinge',p.constraints.includes('noFloor')||!p.equipmentCodes.includes('mat')?'wallPushup':'dbFloorPress'];
 else ids=[...(p.equipmentCodes.includes('chair')?['chairSquat']:[]),'wallPushup',...(!p.constraints.includes('noFloor')&&p.equipmentCodes.includes('mat')?['gluteBridge']:['standingMobility'])];
 // New participants receive foundation variants, never an automatic load progression.
 if(experience==='new')ids=ids.map(id=>EXERCISES[id].difficulty==='Familiar technique'?'standingMobility':id);
 ids=[...new Set(ids)].slice(0,minutes<10?1:3);
 return ids.map(id=>({id,sets:1,reps:['walking','running','standingMobility'].includes(id)?`Up to ${Math.min(minutes,10)} min`:'6–8 comfortable reps',restSeconds:60}));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraft,updateSession,progress,monday} from '../assets/js/workouts-model.js';
const example = {goal:'Example: build a consistent routine',equipment:'Example: mat',experience:'new',minutes:30,weekStart:'2026-10-05',days:[4,0,2,0]};
test('selected days become a sorted, unique blank week without exercise prescriptions',()=>{
  const draft=createDraft(example);
  assert.deepEqual(draft.sessions.map(s=>s.id),['2026-10-05','2026-10-07','2026-10-09']);
  assert.ok(draft.sessions.every(s=>s.title==='' && s.details==='' && s.status==='planned'));
  assert.equal(draft.status,'draft');
});
test('invalid dates, non-Mondays, empty days and invalid time fail closed',()=>{
  for (const patch of [{weekStart:'2026-02-30'},{weekStart:'2026-10-06'},{weekStart:''},{days:[]},{days:[7]},{days:[1.5]},{minutes:0},{minutes:241},{minutes:2.5},{experience:'unknown'},{goal:''}]) assert.throws(()=>createDraft({...example,...patch}));
});
test('editing and check-ins preserve the input draft and accurately count completed sessions',()=>{
  const original=createDraft(example);
  const edited=updateSession(original,'2026-10-05','title','Example session');
  const complete=updateSession(edited,'2026-10-05','status','completed');
  const skipped=updateSession(complete,'2026-10-07','status','skipped');
  const note=updateSession(skipped,'2026-10-05','notes','Example check-in');
  assert.deepEqual(progress(note),{completed:1,total:3});
  assert.equal(original.sessions[0].title,'');
  assert.equal(note.sessions[0].notes,'Example check-in');
  assert.equal(note.status,'draft');
  assert.deepEqual(progress(updateSession(note,'2026-10-05','status','planned')),{completed:0,total:3});
});
test('session updates reject unknown IDs, fields, excessive text and invalid statuses',()=>{
  const draft=createDraft(example);
  for (const args of [['nope','title','test'],['2026-10-05','id','other'],['2026-10-05','status','approved'],['2026-10-05','minutes',-1],['2026-10-05','notes','x'.repeat(1001)]]) assert.throws(()=>updateSession(draft,...args));
});
test('Monday calculation keeps Sunday in its prior week',()=>{
  assert.equal(monday(new Date(2026,9,11)),'2026-10-05');
});

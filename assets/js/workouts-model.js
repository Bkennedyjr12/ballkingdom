import {validateExercises} from './workouts-exercises.js';
export const DAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const experiences = ['new', 'some', 'regular'];
export function monday(date = new Date()) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return value.toISOString().slice(0, 10);
}
export function createDraft(input) {
  const goal = String(input.goal || '').trim();
  const displayName = String(input.displayName || '').trim();
  if(displayName.length>80)throw new Error('Keep your optional display name within 80 characters.');
  const equipment = String(input.equipment || '').trim();
  const minutes = Number(input.minutes);
  const start = new Date(`${input.weekStart}T00:00:00Z`);
  if (!goal || goal.length > 200 || equipment.length > 200) throw new Error('Enter a goal and keep planning details under 200 characters.');
  if (!experiences.includes(input.experience)) throw new Error('Choose your experience level.');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) throw new Error('Choose 1 to 240 available minutes.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart) || Number.isNaN(start.getTime()) || start.toISOString().slice(0,10) !== input.weekStart || start.getUTCDay() !== 1) throw new Error('Choose a Monday as your week beginning.');
  if (!Array.isArray(input.days) || !input.days.length || input.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Select at least one available day.');
  const days = [...new Set(input.days)].sort((a,b) => a-b);
  const intake = {displayName, goal, equipment, experience: input.experience, minutes, weekStart: input.weekStart, days};
  return {schemaVersion: 1, status: 'draft', intake, sessions: days.map(day => {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + day);
    return {id: date.toISOString().slice(0,10), day: DAYS[day], title: '', minutes, details: '', shortOption: '', exercises: [], status: 'planned', notes: ''};
  })};
}
export function updateSession(draft, id, field, value) {
  if (!draft) throw new Error('Create a weekly draft first.');
  const session = draft.sessions.find(session => session.id === id);
  if (!session) throw new Error('Session not found.');
  if (!['title','minutes','details','shortOption','status','notes','exercises'].includes(field)) throw new Error('Unknown session field.');
  if(field==='exercises'){value=validateExercises(value);}
  else if (field === 'minutes') {
    value = Number(value);
    if (!Number.isInteger(value) || value < 1 || value > 240) throw new Error('Enter 1 to 240 minutes.');
  } else if (field === 'status') {
    if (!['planned','completed','skipped'].includes(value)) throw new Error('Choose a valid check-in status.');
  } else {
    if (typeof value !== 'string' || value.length > (field === 'title' ? 120 : 1000)) throw new Error('Keep the entry within the displayed limit.');
  }
  return {...draft, status:'draft', sessions:draft.sessions.map(item => item.id === id ? {...item,[field]:value} : item)};
}
export function progress(draft) {
  return {completed: draft?.sessions.filter(session => session.status === 'completed').length || 0, total: draft?.sessions.length || 0};
}

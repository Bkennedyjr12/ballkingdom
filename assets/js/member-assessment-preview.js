import { installMemberAssessment } from './member-assessment-app.js';
import { scoreAssessment } from './ai-assessment-model.js';
let observer, user = null, fail = false;
const records = new Map(), attempts = new Map();
const runtime = { observe(callback) { observer = callback; callback(user); return () => { observer = null; }; }, assessmentAccount: {
  async call(action, payload) {
    if (!user) throw Object.assign(new Error(), { code: 'functions/unauthenticated' });
    if (fail) { fail = false; throw new Error('synthetic request failure'); }
    if (action === 'save') {
      const id = attempts.get(payload.requestId) ?? crypto.randomUUID(); attempts.set(payload.requestId, id);
      const prior = records.get(id), result = prior ?? { assessmentId: id, createdAtMs: Date.now(), report: scoreAssessment(payload.answers) };
      records.set(id, result); return result;
    }
    if (action === 'list') return { items: [...records.values()].slice(0, 20), nextCursor: null };
    if (action === 'get') return records.get(payload.assessmentId);
    if (action === 'delete') { records.delete(payload.assessmentId); return { deleted: true }; }
  },
} };
installMemberAssessment({ root: document.querySelector('#member-assessments'), runtime, enabled: true });
document.querySelector('#preview-signin').addEventListener('click', () => { user = { uid: 'synthetic-owner' }; observer?.(user); });
document.querySelector('#preview-signout').addEventListener('click', () => { user = null; observer?.(null); });
document.querySelector('#preview-fail').addEventListener('click', () => { fail = true; });

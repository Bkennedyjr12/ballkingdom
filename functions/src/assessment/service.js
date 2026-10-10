import { randomUUID } from 'node:crypto';
import { ASSESSMENT_VERSION, scoreAssessment } from './model.js';

const SAFE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = (code, message) => Object.assign(new Error(message), { code });

// This factory is intentionally not exported from Functions index.js.
// authenticateRequest is a SERVER-OWNED verifier, never a function or identity from request data.
// Future adapter: Firebase verified callable Auth + enforced App Check, with an owner-scoped repository.
export function createAssessmentService({ enabled = false, repository, authenticateRequest, now = Date.now, makeId = randomUUID } = {}) {
  const active = enabled === true;
  if (active && (typeof authenticateRequest !== 'function' || typeof repository?.createForOwner !== 'function'
    || typeof repository?.getForOwner !== 'function' || typeof now !== 'function' || typeof makeId !== 'function')) {
    throw fail('ASSESSMENT_CONFIGURATION_INVALID', 'Assessment saving is unavailable.');
  }

  async function owner(context) {
    if (!active) throw fail('ASSESSMENT_DISABLED', 'Assessment saving is not connected.');
    let identity;
    try { identity = await authenticateRequest(context); } catch { identity = null; }
    if (!identity || typeof identity.uid !== 'string' || !SAFE_ID.test(identity.uid) || identity.appCheckValid !== true) {
      throw fail('ASSESSMENT_AUTH_REQUIRED', 'Verified sign-in and App Check are required.');
    }
    return identity.uid;
  }

  async function save(input, context) {
    const uid = await owner(context);
    if (!exactKeys(input, ['schemaVersion', 'answers']) || input.schemaVersion !== ASSESSMENT_VERSION) {
      throw fail('ASSESSMENT_INPUT_INVALID', 'Assessment input is invalid.');
    }
    let report;
    try { report = scoreAssessment(input.answers); } catch { throw fail('ASSESSMENT_INPUT_INVALID', 'Assessment input is invalid.'); }
    const assessmentId = makeId();
    const createdAtMs = now();
    if (typeof assessmentId !== 'string' || !SAFE_ID.test(assessmentId) || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
      throw fail('ASSESSMENT_CONFIGURATION_INVALID', 'Assessment saving is unavailable.');
    }
    const saved = Object.freeze({ ownerUid: uid, schemaVersion: ASSESSMENT_VERSION, answers: Object.freeze([...input.answers]), createdAtMs });
    try { await repository.createForOwner(uid, assessmentId, saved); }
    catch { throw fail('ASSESSMENT_SAVE_FAILED', 'Assessment could not be saved. Try again later.'); }
    return Object.freeze({ assessmentId, createdAtMs, report });
  }

  async function get(input, context) {
    const uid = await owner(context);
    if (!exactKeys(input, ['assessmentId']) || typeof input.assessmentId !== 'string' || !SAFE_ID.test(input.assessmentId)) {
      throw fail('ASSESSMENT_INPUT_INVALID', 'Assessment input is invalid.');
    }
    let saved;
    try { saved = await repository.getForOwner(uid, input.assessmentId); }
    catch { throw fail('ASSESSMENT_LOAD_FAILED', 'Assessment could not be loaded. Try again later.'); }
    let report;
    try {
      if (!exactKeys(saved, ['ownerUid', 'schemaVersion', 'answers', 'createdAtMs']) || saved.ownerUid !== uid
        || saved.schemaVersion !== ASSESSMENT_VERSION || !Number.isSafeInteger(saved.createdAtMs) || saved.createdAtMs < 0) {
        throw new Error('Unavailable assessment');
      }
      report = scoreAssessment(saved.answers);
    } catch { throw fail('ASSESSMENT_NOT_FOUND', 'Assessment was not found.'); }
    return Object.freeze({ assessmentId: input.assessmentId, createdAtMs: saved.createdAtMs, report });
  }

  return Object.freeze({ save, get });
}

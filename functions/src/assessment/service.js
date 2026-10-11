import { createHash } from 'node:crypto';
import { ASSESSMENT_VERSION, scoreAssessment } from './model.js';

export const SAVE_CONSENT_VERSION = 'member-opt-in-until-delete-v1';
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = (code, message) => Object.assign(new Error(message), { code });
const stableId = (uid, requestId) => createHash('sha256').update('bk-assessment-v1\0' + uid + '\0' + requestId).digest('hex');

// No deployed endpoint imports this module until the separate account release is approved.
// Identity and quota adapters are server-owned; request payloads cannot supply them.
export function createAssessmentService({ enabled = false, repository, authenticateRequest, now = Date.now, makeId = stableId } = {}) {
  const active = enabled === true;
  if (active && (typeof authenticateRequest !== 'function' || ['createForOwner', 'getForOwner', 'listForOwner', 'deleteForOwner', 'consumeQuota'].some(name => typeof repository?.[name] !== 'function')
    || typeof now !== 'function' || typeof makeId !== 'function')) {
    throw fail('ASSESSMENT_CONFIGURATION_INVALID', 'Assessment saving is unavailable.');
  }

  async function owner(context, action) {
    if (!active) throw fail('ASSESSMENT_DISABLED', 'Assessment saving is not connected.');
    let identity;
    try { identity = await authenticateRequest(context); } catch { identity = null; }
    if (!identity || typeof identity.uid !== 'string' || !SAFE_ID.test(identity.uid) || identity.appCheckValid !== true) {
      throw fail('ASSESSMENT_AUTH_REQUIRED', 'Verified sign-in and App Check are required.');
    }
    let permitted = false;
    try { permitted = await repository.consumeQuota(identity.uid, action, now()); } catch { /* Fail closed. */ }
    if (permitted !== true) throw fail('ASSESSMENT_RATE_LIMITED', 'Account actions are temporarily limited. Wait a minute and retry.');
    return identity.uid;
  }

  function publicResult(uid, assessmentId, saved) {
    if (!exactKeys(saved, ['ownerUid', 'schemaVersion', 'answers', 'createdAtMs', 'saveConsentVersion']) || saved.ownerUid !== uid
      || saved.schemaVersion !== ASSESSMENT_VERSION || saved.saveConsentVersion !== SAVE_CONSENT_VERSION
      || !Number.isSafeInteger(saved.createdAtMs) || saved.createdAtMs < 0 || typeof assessmentId !== 'string' || !SAFE_ID.test(assessmentId)) {
      throw new Error('Unavailable assessment');
    }
    return Object.freeze({ assessmentId, createdAtMs: saved.createdAtMs, report: scoreAssessment(saved.answers) });
  }

  function validateId(input) {
    if (!exactKeys(input, ['assessmentId']) || typeof input.assessmentId !== 'string' || !SAFE_ID.test(input.assessmentId)) {
      throw fail('ASSESSMENT_INPUT_INVALID', 'Assessment input is invalid.');
    }
    return input.assessmentId;
  }

  async function save(input, context) {
    const uid = await owner(context, 'save');
    if (!exactKeys(input, ['schemaVersion', 'answers', 'saveConsent', 'requestId']) || input.schemaVersion !== ASSESSMENT_VERSION
      || input.saveConsent !== true || typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId)) {
      throw fail('ASSESSMENT_INPUT_INVALID', 'Choose to save a complete assessment before continuing.');
    }
    try { scoreAssessment(input.answers); } catch { throw fail('ASSESSMENT_INPUT_INVALID', 'Assessment input is invalid.'); }
    const assessmentId = makeId(uid, input.requestId), createdAtMs = now();
    if (typeof assessmentId !== 'string' || !SAFE_ID.test(assessmentId) || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
      throw fail('ASSESSMENT_CONFIGURATION_INVALID', 'Assessment saving is unavailable.');
    }
    const saved = Object.freeze({ ownerUid: uid, schemaVersion: ASSESSMENT_VERSION, answers: Object.freeze([...input.answers]), createdAtMs, saveConsentVersion: SAVE_CONSENT_VERSION });
    let result;
    try { result = await repository.createForOwner(uid, assessmentId, saved); }
    catch { throw fail('ASSESSMENT_SAVE_FAILED', 'Assessment could not be confirmed saved. Keep this tab open and retry.'); }
    if (result?.status === 'deleted') throw fail('ASSESSMENT_ALREADY_DELETED', 'This saved assessment was deleted. Start a new assessment to save again.');
    if (result?.status === 'conflict') throw fail('ASSESSMENT_RETRY_CONFLICT', 'These answers differ from the saved attempt. Start a new save attempt.');
    if (result?.status === 'capacity') throw fail('ASSESSMENT_CAPACITY', 'Your account holds 100 assessments. Delete an older result before saving another.');
    try {
      if (result?.status !== 'saved') throw new Error('Save not confirmed');
      return publicResult(uid, assessmentId, result.record);
    } catch { throw fail('ASSESSMENT_SAVE_FAILED', 'Assessment could not be confirmed saved. Keep this tab open and retry.'); }
  }

  async function get(input, context) {
    const uid = await owner(context, 'read'), assessmentId = validateId(input);
    let saved;
    try { saved = await repository.getForOwner(uid, assessmentId); }
    catch { throw fail('ASSESSMENT_LOAD_FAILED', 'Assessment could not be loaded. Try again later.'); }
    try { return publicResult(uid, assessmentId, saved); }
    catch { throw fail('ASSESSMENT_NOT_FOUND', 'Assessment was not found.'); }
  }

  async function list(input, context) {
    const uid = await owner(context, 'read');
    if (!exactKeys(input, ['cursor']) || !(input.cursor === null || typeof input.cursor === 'string' && SAFE_ID.test(input.cursor))) {
      throw fail('ASSESSMENT_INPUT_INVALID', 'Assessment input is invalid.');
    }
    let result;
    try { result = await repository.listForOwner(uid, { cursor: input.cursor, limit: 20 }); }
    catch { throw fail('ASSESSMENT_LOAD_FAILED', 'Saved assessments could not be loaded. Retry later.'); }
    if (result?.status === 'invalid-cursor') throw fail('ASSESSMENT_INPUT_INVALID', 'Reload your saved assessment list.');
    try {
      if (result?.status !== 'ok' || !Array.isArray(result.items) || result.items.length > 20
        || !(result.nextCursor === null || typeof result.nextCursor === 'string' && SAFE_ID.test(result.nextCursor))) throw new Error('Invalid list');
      return Object.freeze({ items: Object.freeze(result.items.map(item => publicResult(uid, item.assessmentId, item.record))), nextCursor: result.nextCursor });
    } catch { throw fail('ASSESSMENT_LOAD_FAILED', 'Saved assessments could not be loaded. Retry later.'); }
  }

  async function remove(input, context) {
    const uid = await owner(context, 'delete'), assessmentId = validateId(input);
    try { await repository.deleteForOwner(uid, assessmentId, now()); }
    catch { throw fail('ASSESSMENT_DELETE_FAILED', 'Deletion could not be confirmed. Keep this tab open and retry.'); }
    return Object.freeze({ deleted: true });
  }

  return Object.freeze({ save, get, list, remove });
}

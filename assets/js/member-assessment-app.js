import { ASSESSMENT_VERSION } from './ai-assessment-model.js';
import { mountAssessment } from './ai-assessment-app.js';

// Uses the existing named workout app's in-memory Firebase Auth and App Check.
// This component does not persist tokens, email, answers, identity or grants in browser storage.
export function createAssessmentAccountClient({ functions, httpsCallable } = {}) {
  if (!functions || typeof httpsCallable !== 'function') throw new Error('Account saving is unavailable.');
  const callable = httpsCallable(functions, 'assessmentAccount', { timeout: 15000 });
  return Object.freeze({
    async call(action, payload) {
      if (!['save', 'list', 'get', 'delete'].includes(action)) throw new Error('Account action is unavailable.');
      const response = await callable({ action, payload });
      return response?.data;
    },
  });
}

const publicError = error => ({
  'functions/unauthenticated': 'Sign in again with your newest email link. Your unsaved answers stay in this tab.',
  'functions/resource-exhausted': 'Account actions are temporarily limited, or your account holds 100 assessments. Wait a minute or delete an older saved result.',
  'functions/not-found': 'This assessment was deleted or is unavailable. Refresh the list.',
  'functions/failed-precondition': 'Account saving is unavailable for this attempt. Start a new assessment or retry later.',
}[error?.code] ?? 'This action could not be confirmed. Keep this tab open and retry.');

function validResult(value) {
  return value && /^[A-Za-z0-9_-]{1,128}$/.test(value.assessmentId ?? '') && Number.isSafeInteger(value.createdAtMs) && value.createdAtMs >= 0
    && value.report?.schemaVersion === ASSESSMENT_VERSION && Number.isInteger(value.report.total) && value.report.total >= 0 && value.report.total <= 36
    && Array.isArray(value.report.dimensions) && value.report.dimensions.length === 3;
}

export function installMemberAssessment({ root, runtime, enabled = false, makeRequestId = () => crypto.randomUUID() } = {}) {
  if (!root || !enabled) return Object.freeze({ destroy() {} });
  if (typeof runtime?.observe !== 'function' || typeof runtime.assessmentAccount?.call !== 'function') throw new Error('Account saving is unavailable.');
  root.hidden = false;
  let uid = null, epoch = 0, busy = false, mount = null, snapshot = null, attempt = null, cursor = null, stop;
  const disabledBefore = new WeakMap();
  const node = (tag, text, cls) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (cls) value.className = cls; return value; };
  const control = (label, handler) => { const value = node('button', label, 'assessment-button'); value.type = 'button'; value.addEventListener('click', handler); return value; };
  const title = node('h2', 'Your AI assessment notebook');
  const notice = node('p', 'Sign in above to use your assessment notebook. The guest assessment remains available without an account.');
  const signInLink = node('a', 'Go to sign-in'); signInLink.href = '#signin-panel'; notice.append(document.createTextNode(' '), signInLink);
  const privateView = node('div'), stage = node('section'), saveArea = node('div', undefined, 'assessment-account-save');
  const status = node('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const save = control('Save this result to my account', () => saveCurrent()); save.disabled = true;
  const refresh = control('Refresh saved results', () => loadList(false));
  const more = control('Load older results', () => loadList(true)); more.hidden = true;
  const list = node('div', undefined, 'assessment-account-list'), savedReport = node('section');
  saveArea.append(node('p', 'Saving is your choice. Saved answers and results remain private to your account until you delete them. Taking or reviewing an assessment does not save it.'), save);
  privateView.append(stage, saveArea, node('h3', 'Saved results'), refresh, list, more, savedReport);
  root.replaceChildren(title, notice, privateView, status); privateView.hidden = true;

  function controls() {
    for (const field of stage.querySelectorAll('button, input')) {
      if (busy) { if (!disabledBefore.has(field)) disabledBefore.set(field, field.disabled); field.disabled = true; }
      else if (disabledBefore.has(field)) { field.disabled = disabledBefore.get(field); disabledBefore.delete(field); }
    }
    for (const button of root.querySelectorAll('button')) {
      if (stage.contains(button)) continue;
      button.disabled = busy || button.hasAttribute('data-delete-opener') && !!button.closest('article')?.querySelector('.assessment-account-delete');
    }
    save.disabled = busy || !snapshot || attempt?.saved === true;
  }
  async function perform(operation, apply) {
    if (busy || !uid) return;
    const started = epoch; busy = true; controls(); status.textContent = 'Waiting for confirmation…';
    try {
      const result = await operation();
      if (started === epoch && uid) apply(result);
    } catch (error) { if (started === epoch && uid) status.textContent = publicError(error); }
    finally { if (started === epoch) { busy = false; controls(); } }
  }
  async function saveCurrent() {
    if (!snapshot) return;
    const current = snapshot;
    if (!attempt) attempt = { requestId: makeRequestId(), answers: [...current.answers], saved: false };
    const pending = attempt;
    await perform(() => runtime.assessmentAccount.call('save', { schemaVersion: ASSESSMENT_VERSION, answers: [...pending.answers], saveConsent: true, requestId: pending.requestId }), value => {
      if (!validResult(value) || value.report.total !== current.report.total) throw new Error('Save not confirmed');
      pending.saved = true; pending.assessmentId = value.assessmentId;
      status.textContent = 'Saved privately until you delete it. Refresh saved results to reopen it.';
    });
  }
  function showReport(value) {
    if (!validResult(value)) throw new Error('Report not confirmed');
    savedReport.replaceChildren(node('h3', 'Saved readiness snapshot'), node('p', new Date(value.createdAtMs).toLocaleString()), node('p', value.report.total + ' / 36'));
    for (const area of value.report.dimensions) savedReport.append(node('h4', area.title), node('p', area.score + ' / 12'), node('p', area.nextStep));
    status.textContent = 'Saved result opened. It does not change the current assessment.';
  }
  function addSaved(value) {
    if (!validResult(value)) throw new Error('List not confirmed');
    const row = node('article', undefined, 'assessment-account-row');
    row.dataset.assessmentId = value.assessmentId;
    const open = control('Open saved result', () => perform(() => runtime.assessmentAccount.call('get', { assessmentId: value.assessmentId }), showReport));
    const remove = control('Delete saved result', () => {
      if (busy || row.querySelector('.assessment-account-delete')) return;
      const confirmation = node('div', undefined, 'assessment-account-delete');
      const cancel = control('Keep saved result', () => { confirmation.remove(); remove.disabled = false; });
      const confirm = control('Confirm delete', () => perform(() => runtime.assessmentAccount.call('delete', { assessmentId: value.assessmentId }), result => {
        if (result?.deleted !== true) throw new Error('Deletion not confirmed');
        row.remove(); savedReport.replaceChildren();
        if (attempt?.assessmentId === value.assessmentId) { snapshot = null; attempt = null; mount?.destroy(); mount = mountAssessment(stage, { onChange: changed, accountMode: true }); }
        cursor = null; more.hidden = true;
        status.textContent = 'Saved answers and result deleted. Your workout plans are unchanged.';
      }));
      confirmation.append(node('p', 'Delete these saved answers and this result? This cannot be undone.'), cancel, confirm); row.append(confirmation); remove.disabled = true;
    });
    remove.dataset.deleteOpener = '';
    row.append(node('p', new Date(value.createdAtMs).toLocaleString() + ' · ' + value.report.total + ' / 36'), open, remove); list.append(row);
  }
  async function loadList(append) {
    const next = append ? cursor : null;
    if (append && !next) return;
    await perform(() => runtime.assessmentAccount.call('list', { cursor: next }), result => {
      if (!Array.isArray(result?.items) || result.items.length > 20 || !(result.nextCursor === null || /^[A-Za-z0-9_-]{1,128}$/.test(result.nextCursor ?? '')) || !result.items.every(validResult)) throw new Error('List not confirmed');
      if (!append) list.replaceChildren();
      result.items.forEach(addSaved); cursor = result.nextCursor; more.hidden = !cursor;
      status.textContent = result.items.length ? 'Saved results loaded.' : 'No saved results. Your current assessment is saved only if you choose to save it.';
    });
  }
  function changed(value) {
    if (!value || !snapshot || JSON.stringify(value.answers) !== JSON.stringify(snapshot.answers)) attempt = null;
    snapshot = value; controls();
  }
  stop = runtime.observe(user => {
    epoch += 1; uid = user?.uid ?? null; busy = false; snapshot = null; attempt = null; cursor = null; mount?.destroy(); mount = null;
    stage.replaceChildren(); list.replaceChildren(); savedReport.replaceChildren(); status.textContent = ''; more.hidden = true;
    privateView.hidden = !uid; notice.hidden = !!uid;
    if (uid) { mount = mountAssessment(stage, { onChange: changed, accountMode: true }); loadList(false); }
  });
  return Object.freeze({ destroy() { epoch += 1; uid = null; stop?.(); mount?.destroy(); root.replaceChildren(); root.hidden = true; } });
}

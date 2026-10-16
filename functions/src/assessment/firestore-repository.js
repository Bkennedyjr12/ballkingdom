const ID = /^[A-Za-z0-9_-]{1,128}$/;
const validId = value => typeof value === 'string' && ID.test(value);
const available = () => new Error('Assessment repository unavailable.');

// Admin-only namespace. Existing live client Rules deny this entire collection.
// Never reads workout, commerce, companion, or other member collections.
export function createAssessmentRepository({ db, documentIdField } = {}) {
  if (!db || typeof db.collection !== 'function' || typeof db.runTransaction !== 'function' || !documentIdField) throw available();
  function owner(uid) {
    if (!validId(uid)) throw available();
    return db.collection('bkAssessmentAccounts').doc(uid);
  }
  function refs(uid, id) {
    if (!validId(id)) throw available();
    const account = owner(uid);
    return { account, run: account.collection('runs').doc(id), receipt: account.collection('deletedReceipts').doc(id) };
  }
  function state(snapshot) {
    const value = snapshot.data() ?? { recordsCount: 0, windowStartMs: 0, actions: 0, writes: 0 };
    if (!['recordsCount', 'windowStartMs', 'actions', 'writes'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
      || value.recordsCount > 100 || value.actions > 40 || value.writes > 10) throw available();
    return value;
  }
  return Object.freeze({
    async consumeQuota(uid, action, time) {
      if (!['save', 'read', 'delete'].includes(action) || !Number.isSafeInteger(time) || time < 0) throw available();
      const account = owner(uid);
      return db.runTransaction(async transaction => {
        const current = state(await transaction.get(account));
        if (time < current.windowStartMs) return false;
        const fresh = time >= current.windowStartMs + 60000;
        const next = { ...current, windowStartMs: fresh ? time : current.windowStartMs, actions: fresh ? 0 : current.actions, writes: fresh ? 0 : current.writes };
        if (next.actions >= 40 || action !== 'read' && next.writes >= 10) return false;
        next.actions += 1;
        if (action !== 'read') next.writes += 1;
        transaction.set(account, next);
        return true;
      });
    },
    async createForOwner(uid, id, record) {
      const reference = refs(uid, id);
      if (record?.ownerUid !== uid) throw available();
      return db.runTransaction(async transaction => {
        const [prior, receipt, account] = await Promise.all([transaction.get(reference.run), transaction.get(reference.receipt), transaction.get(reference.account)]);
        if (receipt.exists) return { status: 'deleted' };
        if (prior.exists) {
          const saved = prior.data();
          return saved.ownerUid === uid && saved.schemaVersion === record.schemaVersion && saved.saveConsentVersion === record.saveConsentVersion
            && Array.isArray(saved.answers) && saved.answers.length === record.answers.length && saved.answers.every((value, i) => value === record.answers[i])
            ? { status: 'saved', record: saved } : { status: 'conflict' };
        }
        const current = state(account);
        if (current.recordsCount >= 100) return { status: 'capacity' };
        transaction.create(reference.run, record);
        transaction.set(reference.account, { ...current, recordsCount: current.recordsCount + 1 });
        return { status: 'saved', record };
      });
    },
    async getForOwner(uid, id) {
      const snapshot = await refs(uid, id).run.get();
      return snapshot.exists ? snapshot.data() : null;
    },
    async listForOwner(uid, { cursor, limit }) {
      if (limit !== 20 || !(cursor === null || validId(cursor))) throw available();
      const collection = owner(uid).collection('runs');
      let query = collection.orderBy('createdAtMs', 'desc').orderBy(documentIdField, 'desc');
      if (cursor !== null) {
        const prior = await collection.doc(cursor).get();
        if (!prior.exists) return { status: 'invalid-cursor' };
        query = query.startAfter(prior);
      }
      const result = await query.limit(limit + 1).get(), page = result.docs.slice(0, limit);
      return { status: 'ok', items: page.map(document => ({ assessmentId: document.id, record: document.data() })), nextCursor: result.docs.length > limit ? page.at(-1).id : null };
    },
    async deleteForOwner(uid, id, time) {
      if (!Number.isSafeInteger(time) || time < 0) throw available();
      const reference = refs(uid, id);
      await db.runTransaction(async transaction => {
        const [run, account] = await Promise.all([transaction.get(reference.run), transaction.get(reference.account)]);
        if (!run.exists) return;
        const current = state(account);
        if (run.data()?.ownerUid !== uid || current.recordsCount < 1) throw available();
        transaction.delete(reference.run);
        // Opaque ID plus deletion time only: no answers, score, email, or source data.
        // Retained to prevent an old lost-response retry from recreating deleted answers.
        transaction.set(reference.receipt, { deletedAtMs: time });
        transaction.set(reference.account, { ...current, recordsCount: current.recordsCount - 1 });
      });
    },
  });
}

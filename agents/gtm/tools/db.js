// Firestore data-access layer for the GTM agents (Firebase Admin SDK).
//
// This replaces the previous Supabase-backed helper. It exposes the SAME
// function names the agent files already import (leadExists, insertLead,
// updateLead, getNewLeads, getLeadsDueForFollowup, getDigestStats,
// logOutreach, getOutreachHistory) plus a handful of small generic helpers
// used by the agents that previously instantiated their own Supabase client
// (insertLead-style writes against contacts / replies / content_queue /
// audit_briefs / email_campaigns / email_sends).
//
// Credentials: set env FIREBASE_SERVICE_ACCOUNT to the service-account JSON
// (raw JSON or base64 of it) — mirrors api/_db.js. NEVER commit the key.
//
// Collection names match the previous Postgres table names, and doc IDs reuse
// the original uuids, so every foreign-key field (lead_id, contact_id, ...)
// keeps referencing valid docs and the data is shared with the /api layer.
import admin from 'firebase-admin';

let _fs;
function db() {
  if (_fs) return _fs;
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
    const json = raw.trim().charAt(0) === '{' ? raw : Buffer.from(raw, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
  }
  _fs = admin.firestore();
  return _fs;
}

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

// ── Generic primitives (mirror api/_db.js) ─────────────────────────────────

// Normalize Firestore types to plain JSON (Timestamp -> ISO string), recursive.
function normalize(v) {
  if (v == null) return v;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object' && v.constructor === Object) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = normalize(v[k]);
    return out;
  }
  return v;
}

function snap2obj(snap) {
  if (!snap || !snap.exists) return null;
  return Object.assign({ id: snap.id }, normalize(snap.data()));
}

async function getById(coll, id) {
  if (id == null || id === '') return null;
  return snap2obj(await db().collection(coll).doc(String(id)).get());
}

// opts: { where:[[field,op,value],...], order, ascending, limit }
async function list(coll, opts = {}) {
  let q = db().collection(coll);
  for (const w of (opts.where || [])) q = q.where(w[0], w[1], w[2]);
  if (opts.order) q = q.orderBy(opts.order, opts.ascending === false ? 'desc' : 'asc');
  if (opts.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map(snap2obj);
}

async function findOne(coll, field, value) {
  const snap = await db().collection(coll).where(field, '==', value).limit(1).get();
  return snap.empty ? null : snap2obj(snap.docs[0]);
}

async function insert(coll, data) {
  const payload = Object.assign({}, data);
  const id = payload.id != null ? String(payload.id) : null;
  delete payload.id;
  if (payload.created_at == null) payload.created_at = FieldValue.serverTimestamp();
  const ref = id ? db().collection(coll).doc(id) : db().collection(coll).doc();
  await ref.set(payload);
  return getById(coll, ref.id);
}

async function insertMany(coll, rows) {
  const out = [];
  // Firestore batches max 500 ops; these inserts are tiny so chunk at 400.
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db().batch();
    const refs = [];
    for (const row of rows.slice(i, i + 400)) {
      const payload = Object.assign({}, row);
      const id = payload.id != null ? String(payload.id) : null;
      delete payload.id;
      if (payload.created_at == null) payload.created_at = FieldValue.serverTimestamp();
      const ref = id ? db().collection(coll).doc(id) : db().collection(coll).doc();
      batch.set(ref, payload);
      refs.push(ref);
    }
    await batch.commit();
    refs.forEach(r => out.push(r.id));
  }
  return out;
}

async function update(coll, id, fields) {
  const payload = Object.assign({}, fields);
  delete payload.id;
  await db().collection(coll).doc(String(id)).set(payload, { merge: true });
  return getById(coll, id);
}

// Count docs matching where filters (replaces Supabase head/count queries).
async function count(coll, where = []) {
  let q = db().collection(coll);
  for (const w of where) q = q.where(w[0], w[1], w[2]);
  const agg = await q.count().get();
  return agg.data().count || 0;
}

// ── Leads ──────────────────────────────────────────────────────────────────

export async function leadExists(email) {
  const found = await findOne('leads', 'email', email);
  return !!found;
}

export async function insertLead(lead) {
  return insert('leads', lead);
}

export async function updateLead(id, fields) {
  await update('leads', id, fields);
}

// Get-or-create a lead keyed by email; merges fields on hit. Returns the lead.
export async function upsertLeadByEmail(email, fields) {
  const existing = await findOne('leads', 'email', email);
  if (existing) return update('leads', existing.id, fields);
  return insert('leads', Object.assign({ email }, fields));
}

// Find a lead by an arbitrary field (e.g. email, company_name).
export async function findLead(field, value) {
  return findOne('leads', field, value);
}

// Leads that haven't been contacted yet.
export async function getNewLeads(limit = 20) {
  // email != null is enforced in JS (Firestore has no rich "is not null").
  const rows = await list('leads', {
    where: [['status', '==', 'new'], ['unsubscribed', '==', false]],
    order: 'created_at',
    ascending: true,
    limit: limit * 2,
  });
  return rows.filter(r => r.email != null).slice(0, limit);
}

// Leads whose next_followup_at has passed.
export async function getLeadsDueForFollowup() {
  const nowIso = new Date().toISOString();
  const rows = await list('leads', {
    where: [
      ['status', 'in', ['sent']],
      ['reply_received', '==', false],
      ['unsubscribed', '==', false],
    ],
  });
  return rows.filter(r =>
    r.next_followup_at != null &&
    r.next_followup_at <= nowIso &&
    (r.outreach_count || 0) < 4
  );
}

// Recent activity for the daily digest.
export async function getDigestStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [newLeadsAdded, emailsSent, repliesReceived] = await Promise.all([
    count('leads', [['created_at', '>=', since]]),
    count('outreach', [['sent_at', '>=', since]]),
    count('leads', [['reply_received', '==', true], ['reply_at', '>=', since]]),
  ]);

  return { newLeadsAdded, emailsSent, repliesReceived };
}

// Lead + its outreach history in one shot (replaces `select('*, outreach(*)')`).
export async function getLeadWithOutreach(email) {
  const lead = await findOne('leads', 'email', email);
  if (!lead) return null;
  lead.outreach = await getOutreachHistory(lead.id);
  return lead;
}

// Subscribed newsletter contacts (used by the email sender).
export async function getSubscribedContacts() {
  const rows = await list('contacts', {
    where: [['unsubscribed', '==', false]],
  });
  return rows.filter(c => c.email != null && c.email.includes('@'));
}

// ── Outreach ───────────────────────────────────────────────────────────────

export async function logOutreach({ leadId, step, subject, body, resendMessageId }) {
  await insert('outreach', {
    lead_id: leadId,
    sequence_step: step,
    subject,
    body,
    resend_message_id: resendMessageId,
    sent_at: FieldValue.serverTimestamp(),
  });
}

export async function getOutreachHistory(leadId) {
  return list('outreach', {
    where: [['lead_id', '==', leadId]],
    order: 'sent_at',
    ascending: true,
  });
}

// ── Replies / content / briefs / campaigns (generic inserts) ───────────────

export async function logReply(reply) {
  return insert('replies', reply);
}

export async function contentAlreadyRepurposed(sourceArticle) {
  const rows = await list('content_queue', {
    where: [['source_article', '==', sourceArticle]],
    limit: 1,
  });
  return rows.length > 0;
}

export async function queueContent(rows) {
  return insertMany('content_queue', rows);
}

export async function insertAuditBrief(brief) {
  return insert('audit_briefs', brief);
}

// Prospect-facing audits, keyed by slug, served dynamically at /audit/<slug>.
export async function saveAudit(slug, data) {
  await update('prospect_audits', slug, { ...data, slug, updated_at: new Date().toISOString() });
  return slug;
}

export async function getAudit(slug) {
  return getById('prospect_audits', slug);
}

export async function insertCampaign(campaign) {
  return insert('email_campaigns', campaign);
}

export async function updateCampaign(id, fields) {
  return update('email_campaigns', id, fields);
}

export async function logEmailSend(send) {
  return insert('email_sends', send);
}

// Observability: one record per GTM agent run.
export async function logRun(stats) {
  return insert('gtm_runs', { ...stats, ran_at: new Date().toISOString() });
}

// ── Suppression / do-not-contact (guardrail for unattended sending) ─────────
// Never contact our own domains, opt-outs, current clients, or competitors.
const OWN_DOMAINS = ['tmitechai.com', 'tmi-technology.com', 'arboroffice.io'];

export async function isSuppressed(email) {
  if (!email) return true;
  const lc = String(email).toLowerCase().trim();
  const domain = lc.split('@')[1] || '';
  if (OWN_DOMAINS.includes(domain)) return true;
  if (await findOne('suppression', 'email', lc)) return true;
  if (domain && await findOne('suppression', 'domain', domain)) return true;
  return false;
}

export async function addSuppression({ email, domain, reason }) {
  const lc = email ? String(email).toLowerCase().trim() : null;
  const dm = domain ? String(domain).toLowerCase().trim() : (lc ? lc.split('@')[1] : null);
  return insert('suppression', { email: lc, domain: dm, reason: reason || 'manual', added_at: new Date().toISOString() });
}

// Re-export the generic primitives for any future ad-hoc use.
export {
  db, FieldValue, Timestamp,
  getById, list, findOne, insert, insertMany, update, count,
};

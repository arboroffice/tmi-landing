// Firestore data-access layer (Firebase Admin SDK). Server-only.
//
// Credentials: set env FIREBASE_SERVICE_ACCOUNT to the service-account JSON
// (raw JSON or base64 of it). NEVER commit the service-account file.
//
// This module exposes small primitives that endpoints use instead of the
// Supabase query builder. Doc IDs reuse the original Postgres uuids, so all
// foreign-key fields (contact_id, lead_id, ...) keep referencing valid docs.
const admin = require('firebase-admin');

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

// Normalize Firestore types to plain JSON (Timestamp -> ISO string), recursively.
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

// where: array of [field, op, value]. op is a Firestore op ('==','in','>=', etc.)
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

async function update(coll, id, fields) {
  const payload = Object.assign({}, fields);
  delete payload.id;
  await db().collection(coll).doc(String(id)).set(payload, { merge: true });
  return getById(coll, id);
}

async function remove(coll, id) {
  await db().collection(coll).doc(String(id)).delete();
  return true;
}

// Get-or-create keyed by a field (replaces upsert onConflict). Merges on hit.
async function upsertByField(coll, field, value, data) {
  const existing = await findOne(coll, field, value);
  if (existing) return update(coll, existing.id, data);
  return insert(coll, Object.assign({}, data, { [field]: value }));
}

// Hydrate: attach a single related doc by a foreign-key field.
// e.g. await hydrateOne(lead, 'contact_id', 'contacts', 'contact')
async function hydrateOne(obj, fkField, coll, as) {
  if (!obj) return obj;
  obj[as] = obj[fkField] ? await getById(coll, obj[fkField]) : null;
  return obj;
}

// Hydrate many rows' children by collecting fk values (batched getAll).
async function hydrateMany(rows, fkField, coll, as) {
  const ids = [...new Set(rows.map(r => r && r[fkField]).filter(Boolean).map(String))];
  const map = {};
  if (ids.length) {
    const refs = ids.map(id => db().collection(coll).doc(id));
    const snaps = await db().getAll(...refs);
    for (const s of snaps) map[s.id] = snap2obj(s);
  }
  for (const r of rows) if (r) r[as] = r[fkField] ? (map[String(r[fkField])] || null) : null;
  return rows;
}

module.exports = {
  db, admin, FieldValue, Timestamp,
  normalize, snap2obj,
  getById, list, findOne, insert, update, remove, upsertByField,
  hydrateOne, hydrateMany,
};

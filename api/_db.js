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

function applyOp(a, op, b) {
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case 'in': return Array.isArray(b) && b.includes(a);
    case 'not-in': return Array.isArray(b) && !b.includes(a);
    case 'array-contains': return Array.isArray(a) && a.includes(b);
    case 'array-contains-any': return Array.isArray(a) && Array.isArray(b) && a.some(x => b.includes(x));
    default: return true;
  }
}

// where: array of [field, op, value]. op is a Firestore op ('==','in','>=', etc.)
//
// To avoid ever requiring a Firestore COMPOSITE index (which would have to be
// declared and deployed per query), we push at most ONE constraint to Firestore
// — a single where filter, or an orderBy+limit when there's no filter — and
// evaluate any remaining where clauses, ordering, and limit in JS. Firestore
// single-field indexes are auto-created, so every query "just works" in prod.
async function list(coll, opts = {}) {
  const where = opts.where || [];
  let q = db().collection(coll);
  let firestoreOrdered = false;

  if (where.length) {
    q = q.where(where[0][0], where[0][1], where[0][2]);            // one filter to Firestore
  } else if (opts.order) {
    q = q.orderBy(opts.order, opts.ascending === false ? 'desc' : 'asc');
    if (opts.limit) { q = q.limit(opts.limit); firestoreOrdered = true; }
  } else if (opts.limit) {
    q = q.limit(opts.limit);
    firestoreOrdered = true; // plain capped fetch, no ordering needed
  }

  const snap = await q.get();
  let rows = snap.docs.map(snap2obj);

  for (let i = 1; i < where.length; i++) {                         // remaining filters in JS
    const [f, op, v] = where[i];
    rows = rows.filter(r => applyOp(r[f], op, v));
  }

  if (opts.order && !firestoreOrdered) {
    const asc = opts.ascending !== false, key = opts.order;
    rows.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return asc ? -1 : 1;
      if (bv == null) return asc ? 1 : -1;
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
  }
  if (opts.limit && !firestoreOrdered) rows = rows.slice(0, opts.limit);
  return rows;
}

async function findOne(coll, field, value) {
  const snap = await db().collection(coll).where(field, '==', value).limit(1).get();
  return snap.empty ? null : snap2obj(snap.docs[0]);
}

// Count docs matching `where` (array of [field, op, value]). Uses list() so the
// same single-filter-to-Firestore + JS-filter rules apply (no composite index).
async function count(coll, where = []) {
  const rows = await list(coll, { where });
  return rows.length;
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
  getById, list, findOne, count, insert, update, remove, upsertByField,
  hydrateOne, hydrateMany,
};

// TMI OS - the tenant-scoped data layer. Today isolation depends on every
// endpoint remembering to add a tenant_id filter and to check ownership before
// an update or delete; the raw _db primitives happily read, write, or delete any
// doc by id regardless of tenant. This binds every read and write to one tenant
// in a single place, closing the two gaps the security audit flagged:
//   1. raw-id getById / update / remove that could touch another tenant's doc
//   2. insert that mass-assigns the request body
//
// Usage:
//   const { scope, pick } = require('./_ostenantdb');
//   const tdb = scope(tenant_id);
//   await tdb.list('os_metrics')                         // auto tenant filter
//   await tdb.getById('os_metrics', id)                  // null unless it is this tenant's
//   await tdb.insert('os_metrics', pick(body, FIELDS))   // tenant_id forced, id dropped
//   await tdb.update('os_metrics', id, pick(body, FIELDS))// ownership verified first
//   await tdb.remove('os_metrics', id)                   // ownership verified first

const db = require('./_db');

// Keep only the allowed keys from an untrusted object. This is the antidote to
// mass-assignment: the caller declares exactly which fields a request may set,
// and everything else (tenant_id, id, role, internal flags) is dropped.
function pick(obj, allowed) {
  const out = {};
  if (!obj || typeof obj !== 'object' || !Array.isArray(allowed)) return out;
  for (const k of allowed) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function scope(tenantId) {
  const tid = tenantId != null ? String(tenantId) : '';
  if (!tid) throw new Error('scope() requires a tenant id');

  // List with the tenant filter always applied first. Extra where clauses from
  // the caller are appended (evaluated in JS by _db, so no composite index).
  async function list(coll, opts = {}) {
    const where = [['tenant_id', '==', tid]].concat(opts.where || []);
    return db.list(coll, Object.assign({}, opts, { where }));
  }

  // Fetch by id but return null unless the doc belongs to this tenant. Callers
  // can no longer read across tenants by guessing an id.
  async function getById(coll, id) {
    if (id == null || id === '') return null;
    const row = await db.getById(coll, id);
    if (!row || String(row.tenant_id) !== tid) return null;
    return row;
  }

  async function findOne(coll, field, value) {
    const rows = await db.list(coll, { where: [['tenant_id', '==', tid], [field, '==', value]], limit: 1 });
    return rows[0] || null;
  }

  async function count(coll, where = []) {
    return (await list(coll, { where })).length;
  }

  // Insert with ownership forced. The caller never picks the doc id via the body,
  // and tenant_id is always this tenant regardless of what was passed.
  async function insert(coll, data) {
    const payload = Object.assign({}, data);
    delete payload.id;
    payload.tenant_id = tid;
    return db.insert(coll, payload);
  }

  // Update only after confirming the doc is this tenant's. tenant_id and id are
  // immutable and stripped from the patch. Returns null if not found or not owned.
  async function update(coll, id, fields) {
    const cur = await getById(coll, id);
    if (!cur) return null;
    const patch = Object.assign({}, fields);
    delete patch.id;
    delete patch.tenant_id;
    return db.update(coll, id, patch);
  }

  // Delete only after confirming ownership. Returns false if not found/owned.
  async function remove(coll, id) {
    const cur = await getById(coll, id);
    if (!cur) return false;
    await db.remove(coll, id);
    return true;
  }

  return { tenant_id: tid, list, getById, findOne, count, insert, update, remove };
}

module.exports = { scope, pick };

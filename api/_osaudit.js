// TMI OS - one unified action log. Every action a worker takes, every approval a
// person clicks, every policy decision that mattered lands here as a single row
// in os_audit, so a company has one honest record of what its staff did and why.
//
// record() is defensive about size: summaries and serialized input/result are
// truncated so a runaway payload can never bloat a doc or the log view.

const db = require('./_db');

const SUMMARY_MAX = 400;
const BLOB_MAX = 2000;

// Truncate a plain string.
function clip(s, max) {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

// Serialize any value to a string and truncate. Objects are JSON-stringified;
// circular or unserializable values degrade to String(v).
function stringifyClip(v, max) {
  if (v == null) return null;
  let str;
  if (typeof v === 'string') {
    str = v;
  } else {
    try { str = JSON.stringify(v); } catch (_e) { str = String(v); }
  }
  if (str == null) return null;
  return str.length > max ? str.slice(0, max) : str;
}

// Write one audit entry. Returns the inserted doc.
async function record(tenantId, entry) {
  const e = entry || {};
  const amount = typeof e.amount === 'number' && isFinite(e.amount) ? e.amount : null;
  const doc = {
    tenant_id: String(tenantId),
    actor: e.actor != null ? clip(e.actor, 200) : 'system',
    action_type: e.action_type != null ? clip(e.action_type, 80) : 'internal',
    target: e.target != null ? clip(e.target, 300) : null,
    summary: clip(e.summary, SUMMARY_MAX),
    input: stringifyClip(e.input, BLOB_MAX),
    result: stringifyClip(e.result, BLOB_MAX),
    status: e.status != null ? clip(e.status, 40) : null,
    reversible: e.reversible === true,
    worker_id: e.worker_id != null ? String(e.worker_id) : null,
    amount,
    created_at: new Date().toISOString(),
  };
  return db.insert('os_audit', doc);
}

// Recent audit entries for a tenant, newest first.
async function list(tenantId, opts) {
  const o = opts || {};
  const limit = Number(o.limit) > 0 ? Number(o.limit) : 50;
  const rows = await db.list('os_audit', { where: [['tenant_id', '==', String(tenantId)]] });
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return rows.slice(0, limit);
}

module.exports = { record, list };

// TMI OS — the company graph endpoint. Tenant-scoped read/write over os_records,
// the noun layer (customers, leads, invoices, payments, jobs, deals). The UI
// reads it for a Records view, the COO and Brain ground on it, and connectors
// feed it real records through upsertRecord. Every read and write is scoped to
// the caller's tenant_id, and updates/deletes verify the target row belongs to
// the tenant, so one company can never touch another's records.
//
// POST { action, ... }
//   action: 'list'   { type? }                 -> { items }
//   action: 'stats'                            -> { stats }
//   action: 'get'    { id }                    -> { item }
//   action: 'create' { data }                  -> { item }   (upsert by external_id)
//   action: 'update' { id, data }              -> { item }
//   action: 'delete' { id }                    -> { ok: true }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { upsertRecord, listRecords, graphStats, TYPES } = require('./_osrecords');
const { scope, pick } = require('./_ostenantdb');

// Fields a client may set on a record. Everything else is dropped (no mass-assign).
const RECORD_FIELDS = ['title', 'status', 'amount', 'customer_id', 'customer_name', 'due_at'];

function log(tid, summary) {
  return db.insert('os_build_log', { tenant_id: tid, kind: 'edit', summary, created_at: new Date().toISOString() }).catch(() => {});
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = String(b.action || 'list');
  const tid = t.tenant_id;
  const tdb = scope(tid); // every read/write below is tenant-bound automatically

  try {
    if (action === 'list') {
      const type = b.type && TYPES.includes(String(b.type)) ? String(b.type) : null;
      const rows = await listRecords(tid, type, { limit: 2000 });
      rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      return res.status(200).json({ items: rows });
    }

    if (action === 'stats') {
      const stats = await graphStats(tid);
      return res.status(200).json({ stats });
    }

    if (action === 'get') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'id required' });
      const cur = await tdb.getById('os_records', id);
      if (!cur) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ item: cur });
    }

    // create / update / delete are writes: viewers are read-only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'create') {
      const spec = Object.assign({}, b.data, { source: (b.data && b.data.source) || 'manual' });
      const { record, created } = await upsertRecord(tid, spec);
      log(tid, `${created ? 'Added' : 'Updated'} ${record.type} ${record.title || record.customer_name || ''}`.trim());
      return res.status(created ? 201 : 200).json({ item: record });
    }

    const id = String(b.id || '');
    if (!id) return res.status(400).json({ error: 'id required' });
    const cur = await tdb.getById('os_records', id);
    if (!cur) return res.status(404).json({ error: 'Not found' });

    if (action === 'update') {
      const d = b.data || {};
      // Allowlist the client fields (no mass-assign), then merge fields safely.
      const patch = Object.assign({ updated_at: new Date().toISOString() }, pick(d, RECORD_FIELDS));
      if (d.fields && typeof d.fields === 'object' && !Array.isArray(d.fields)) {
        patch.fields = Object.assign({}, cur.fields || {}, d.fields);
      }
      const item = await tdb.update('os_records', id, patch);
      return res.status(200).json({ item: item || Object.assign({}, cur, patch) });
    }
    if (action === 'delete') {
      await tdb.remove('os_records', id);
      log(tid, `Removed ${cur.type} ${cur.title || cur.customer_name || ''}`.trim());
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-records:', e.message);
    return res.status(500).json({ error: 'Could not save that' });
  }
};

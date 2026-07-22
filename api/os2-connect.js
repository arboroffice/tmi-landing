// TMI OS — data connection management (in-app). The owner or a manager gets the
// company's ingest endpoint and key, rotates the key, and can push a metric
// value by hand. The raw key is only ever returned to a signed-in manager or
// owner; external tools use it against os2-ingest.
//
// POST { action, ... }
//   'info'                       -> { endpoint, key }
//   'rotate'  (owner)            -> { endpoint, key }
//   'push'    { metric_id, value } -> { ok: true }

const crypto = require('crypto');
const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { applyValue } = require('./_osmetric');

const ENDPOINT = 'https://os.tmitechai.com/api/os2-ingest';

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = String(b.action || 'info');
  const tid = t.tenant_id;

  try {
    const tenant = await db.getById('os_tenants', tid);
    if (!tenant) return res.status(404).json({ error: 'Company not found' });

    if (action === 'info') {
      if (!requireRole(t, res, 'manager')) return;
      let key = tenant.ingest_key;
      if (!key) { key = crypto.randomBytes(24).toString('hex'); await db.update('os_tenants', tid, { ingest_key: key }); }
      return res.status(200).json({ endpoint: ENDPOINT, key });
    }

    if (action === 'rotate') {
      if (!requireRole(t, res, 'owner')) return;
      const key = crypto.randomBytes(24).toString('hex');
      await db.update('os_tenants', tid, { ingest_key: key });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: 'Rotated the data ingest key.', created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ endpoint: ENDPOINT, key });
    }

    if (action === 'push') {
      if (!requireRole(t, res, 'manager')) return;
      const m = await db.getById('os_metrics', String(b.metric_id || ''));
      if (!m || m.tenant_id !== tid) return res.status(404).json({ error: 'Metric not found' });
      if (b.value == null || b.value === '') return res.status(400).json({ error: 'Value required' });
      await applyValue(db, m, b.value, 'manual');
      await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: `Set ${m.label} to ${String(b.value).slice(0, 40)}.`, created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-connect:', e.message);
    return res.status(500).json({ error: 'Could not update your data connection' });
  }
};

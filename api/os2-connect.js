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
const { syncTenant, isBlockedHost } = require('./_ossync');
const { connectStripe, disconnectStripe, syncStripe, stripeConnected } = require('./_osstripe');

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
      const stripe = await stripeConnected(tid).catch(() => false);
      return res.status(200).json({ endpoint: ENDPOINT, key, sync_url: tenant.sync_url || '', last_sync_at: tenant.last_sync_at || '', stripe_connected: !!stripe });
    }

    // Connect Stripe with a read-only restricted/secret key. Owner only. The key
    // is validated live, stored encrypted, and never returned. A first sync runs
    // immediately so cash and revenue appear right away.
    if (action === 'stripe_connect') {
      if (!requireRole(t, res, 'owner')) return;
      try {
        const r = await connectStripe(db, Object.assign({ id: tid }, tenant), String(b.key || ''));
        return res.status(200).json({ ok: true, cash: r.cash, revenue: r.revenue });
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Could not connect Stripe.' });
      }
    }

    if (action === 'stripe_disconnect') {
      if (!requireRole(t, res, 'owner')) return;
      await disconnectStripe(db, Object.assign({ id: tid }, tenant));
      return res.status(200).json({ ok: true });
    }

    if (action === 'stripe_sync') {
      if (!requireRole(t, res, 'manager')) return;
      try {
        const r = await syncStripe(db, Object.assign({ id: tid }, tenant));
        if (r.skipped) return res.status(400).json({ error: 'Stripe is not connected.' });
        return res.status(200).json({ ok: true, cash: r.cash, revenue: r.revenue });
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Could not read Stripe right now.' });
      }
    }

    // Point the OS at one HTTPS URL that returns live numbers as JSON. The cron
    // reads it on a schedule; the owner can also pull it on demand below.
    if (action === 'setsource') {
      if (!requireRole(t, res, 'owner')) return;
      const raw = String(b.sync_url || '').trim();
      if (!raw) {
        await db.update('os_tenants', tid, { sync_url: '' });
        await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: 'Turned off scheduled data sync.', created_at: new Date().toISOString() }).catch(() => {});
        return res.status(200).json({ ok: true, sync_url: '' });
      }
      let u = raw; if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      let host; try { host = new URL(u).hostname; } catch (e) { return res.status(400).json({ error: 'That is not a valid URL.' }); }
      if (isBlockedHost(host)) return res.status(400).json({ error: 'That host is not allowed.' });
      await db.update('os_tenants', tid, { sync_url: u });
      await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: 'Set a scheduled data sync source.', created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ ok: true, sync_url: u });
    }

    // Pull the source URL right now instead of waiting for the schedule.
    if (action === 'syncnow') {
      if (!requireRole(t, res, 'manager')) return;
      if (!tenant.sync_url) return res.status(400).json({ error: 'No data source set yet.' });
      try {
        const r = await syncTenant(db, tenant);
        return res.status(200).json({ ok: true, updated: r.updated, created: r.created });
      } catch (e) {
        return res.status(400).json({ error: e.message || 'Could not read that source.' });
      }
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

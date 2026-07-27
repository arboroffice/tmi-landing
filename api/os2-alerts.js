// TMI OS - Alerts / Awareness center endpoint. Owners set rules ("tell me when
// money owed goes above 50k", "when overdue invoices go above 3"); the engine
// watches the real numbers and fires into the feed plus email/SMS. Reads are
// open to the team; changing rules is manager-only.
//
// POST { action, ... }
//   'state'                                            -> { rules, alerts, catalog, values, can_manage }
//   'save'   { id?, metric_key, op, threshold, channels } (manager) -> { rule }
//   'toggle' { id, active }                             (manager)  -> { rule }
//   'remove' { id }                                     (manager)  -> { ok }
//   'evaluate'                                          (manager)  -> { fired }
//   'read'   { id? | all }                                          -> { ok }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { scope } = require('./_ostenantdb');
const A = require('./_osalerts');

const OPS = ['>', '>=', '<', '<=', '=='];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const tdb = scope(tid);
  const b = req.body || {};
  const action = String(b.action || 'state');
  const canManage = t.role === 'owner' || t.role === 'manager';

  try {
    if (action === 'state') {
      const [rules, alerts, metricsRows] = await Promise.all([
        tdb.list('os_alert_rules', { limit: 200 }),
        tdb.list('os_alerts', { order: 'created_at', ascending: false, limit: 50 }).catch(() => []),
        tdb.list('os_metrics', { limit: 500 }).catch(() => []),
      ]);
      const { values, catalog } = await A.computeValues(tid, metricsRows);
      const catByKey = {}; catalog.forEach(c => { catByKey[c.key] = c; });
      const ruleOut = rules.map(r => Object.assign({}, r, {
        metric_label: r.metric_label || (catByKey[r.metric_key] || {}).label || r.metric_key,
        current: r.metric_key in values ? values[r.metric_key] : null,
        unit: (catByKey[r.metric_key] || {}).unit || '',
      }));
      alerts.sort((a, b2) => String(b2.created_at || '').localeCompare(String(a.created_at || '')));
      return res.status(200).json({ rules: ruleOut, alerts, catalog, values, ops: OPS, can_manage: canManage });
    }

    if (action === 'read') {
      if (b.all) {
        const open = await tdb.list('os_alerts', { where: [['read', '==', false]], limit: 200 }).catch(() => []);
        await Promise.all(open.map(a => tdb.update('os_alerts', a.id, { read: true })));
        return res.status(200).json({ ok: true, count: open.length });
      }
      const id = String(b.id || '');
      if (id) await tdb.update('os_alerts', id, { read: true });
      return res.status(200).json({ ok: true });
    }

    // Changing rules and forcing a sweep are manager-only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'save') {
      const metric_key = String(b.metric_key || '').trim();
      const op = OPS.includes(b.op) ? b.op : '>';
      const threshold = Number(b.threshold);
      if (!metric_key) return res.status(400).json({ error: 'Pick what to watch.' });
      if (!isFinite(threshold)) return res.status(400).json({ error: 'Set a number to compare against.' });
      const channels = { inbox: true, email: !!(b.channels && b.channels.email), sms: !!(b.channels && b.channels.sms) };
      // Resolve a friendly label from the catalog for display.
      const metricsRows = await tdb.list('os_metrics', { limit: 500 }).catch(() => []);
      const { catalog } = await A.computeValues(tid, metricsRows);
      const cat = catalog.find(c => c.key === metric_key);
      const rec = {
        metric_key, metric_label: (cat && cat.label) || metric_key, op, threshold, channels,
        active: true, updated_at: new Date().toISOString(),
      };
      const id = String(b.id || '');
      let rule;
      if (id) rule = await tdb.update('os_alert_rules', id, rec);
      else rule = await tdb.insert('os_alert_rules', Object.assign({ created_at: new Date().toISOString(), tripped: false }, rec));
      return res.status(200).json({ rule });
    }

    if (action === 'toggle') {
      const id = String(b.id || '');
      const rule = await tdb.update('os_alert_rules', id, { active: !!b.active });
      return res.status(200).json({ rule });
    }

    if (action === 'remove') {
      const ok = await tdb.remove('os_alert_rules', String(b.id || ''));
      return res.status(200).json({ ok });
    }

    if (action === 'evaluate') {
      const fired = await A.evaluate(tdb, db, tid, { force: false, cooldownHours: 1 });
      return res.status(200).json({ fired, count: fired.length });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-alerts:', e.message);
    return res.status(500).json({ error: 'Could not complete that' });
  }
};

module.exports.config = { maxDuration: 30 };

// TMI OS — data ingest. The universal way real numbers get into a company's OS.
// Any tool that can send a webhook (Zapier, Make, a spreadsheet script, their
// own backend, a payment or CRM webhook) POSTs metric values here with the
// tenant's ingest key. Values go live on the command center, feed the COO and
// every worker, and appear in the weekly digest. No JWT: the ingest key is the
// credential, and it resolves to exactly one tenant.
//
// Auth: header "x-os-key", or ?key=, or body.key.
// Body shapes (any of):
//   { "metrics": [ { "key": "revenue_mtd", "value": "$212,400", "unit": "" } ] }
//   { "metric": "revenue_mtd", "value": 212400 }
//   { "revenue_mtd": 212400, "unpaid_invoices": 38100 }
// Unknown metric keys are auto-created so a new feed just works.
//
// -> { updated, created }

const db = require('./_db');
const { cors } = require('./_tenant-auth');
const { matches, applyValue } = require('./_osmetric');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = req.body || {};
  const key = String(req.headers['x-os-key'] || (req.query && req.query.key) || b.key || '').trim();
  if (!key) return res.status(401).json({ error: 'Missing ingest key' });

  const tenant = await db.findOne('os_tenants', 'ingest_key', key).catch(() => null);
  if (!tenant) return res.status(401).json({ error: 'Invalid ingest key' });

  let items = [];
  if (Array.isArray(b.metrics)) {
    items = b.metrics.map(m => ({ ref: m.key || m.label || m.metric, value: m.value, unit: m.unit }));
  } else if (b.metric != null) {
    items = [{ ref: b.metric, value: b.value }];
  } else {
    for (const k of Object.keys(b)) {
      if (k === 'key') continue;
      if (b[k] != null && typeof b[k] !== 'object') items.push({ ref: k, value: b[k] });
    }
  }
  items = items.filter(it => it.ref != null && it.value != null).slice(0, 40);
  if (!items.length) return res.status(400).json({ error: 'No metric values in payload' });

  try {
    const metrics = await db.list('os_metrics', { where: [['tenant_id', '==', tenant.id]] });
    let updated = 0, created = 0;
    for (const it of items) {
      let m = metrics.find(x => matches(x, it.ref));
      if (!m) {
        const sort = metrics.reduce((a, r) => Math.max(a, r.sort || 0), 0) + 1;
        m = await db.insert('os_metrics', {
          tenant_id: tenant.id, label: String(it.ref).slice(0, 60), value: '-',
          unit: it.unit ? String(it.unit).slice(0, 12) : '', sort, created_at: new Date().toISOString(),
        });
        metrics.push(m); created++;
      }
      await applyValue(db, m, it.value, 'ingest');
      updated++;
    }
    return res.status(200).json({ updated, created });
  } catch (e) {
    console.error('os2-ingest:', e.message);
    return res.status(500).json({ error: 'Could not ingest' });
  }
};

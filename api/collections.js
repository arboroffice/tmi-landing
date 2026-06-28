// AR / Collections API — overdue invoices, collection actions, and trigger.
//
// GET                  -> overdue invoices (newest first) + recent collection_log actions
// GET ?summary=1       -> totals: count + outstanding by aging bucket (current/30/60/90)
// PATCH/POST {id,fields} -> update an invoice (e.g. mark paid)
// PATCH/POST {trigger:true} -> run the collections agent (dynamic import)
const dbx = require('./_db');
const { cors, requireAuth } = require('./_auth');

const PAID_OR_VOID = new Set(['paid', 'void', 'voided', 'cancelled', 'canceled', 'refunded', 'written_off']);
const dayMs = 86400000;

function invoiceAmount(inv) {
  const v = inv.amount ?? inv.total ?? inv.amount_due ?? inv.balance ?? 0;
  return Number(v) || 0;
}

function bucketFor(daysOverdue) {
  if (daysOverdue <= 30) return 'current';
  if (daysOverdue <= 60) return '30';
  if (daysOverdue <= 90) return '60';
  return '90';
}

// Overdue = status not paid/void and due_date strictly in the past.
function overdueRows(invoices) {
  const now = Date.now();
  const out = [];
  for (const inv of invoices) {
    const status = String(inv.status || '').toLowerCase();
    if (PAID_OR_VOID.has(status)) continue;
    if (!inv.due_date) continue;
    const dueMs = new Date(inv.due_date).getTime();
    if (!Number.isFinite(dueMs) || dueMs >= now) continue;
    const daysOverdue = Math.floor((now - dueMs) / dayMs);
    if (daysOverdue < 1) continue;
    out.push(Object.assign({}, inv, {
      days_overdue: daysOverdue,
      bucket: bucketFor(daysOverdue),
      outstanding: invoiceAmount(inv),
    }));
  }
  out.sort((a, b) => {
    const ad = a.created_at || a.due_date || '', bd = b.created_at || b.due_date || '';
    return ad < bd ? 1 : ad > bd ? -1 : 0; // newest first
  });
  return out;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const invoices = await dbx.list('invoices', { order: 'created_at', ascending: false });
      const overdue = overdueRows(invoices);

      if (req.query.summary) {
        const buckets = { current: { count: 0, outstanding: 0 }, '30': { count: 0, outstanding: 0 }, '60': { count: 0, outstanding: 0 }, '90': { count: 0, outstanding: 0 } };
        let count = 0, outstanding = 0;
        for (const o of overdue) {
          count++; outstanding += o.outstanding;
          buckets[o.bucket].count++; buckets[o.bucket].outstanding += o.outstanding;
        }
        for (const k of Object.keys(buckets)) buckets[k].outstanding = Math.round(buckets[k].outstanding * 100) / 100;
        return res.json({ count, outstanding: Math.round(outstanding * 100) / 100, buckets });
      }

      // Hydrate billing contact + client for display.
      await dbx.hydrateMany(overdue, 'contact_id', 'contacts', 'contacts');
      await dbx.hydrateMany(overdue, 'client_id', 'clients', 'clients');

      let actions = [];
      try {
        actions = await dbx.list('collection_log', { order: 'sent_at', ascending: false, limit: 100 });
      } catch { actions = []; }

      return res.json({ invoices: overdue, actions });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PATCH' || req.method === 'POST') {
    const body = req.body || {};

    if (body.trigger) {
      try {
        const { runCollections } = await import('../agents/gtm/collections.js');
        const stats = await runCollections({ limit: body.limit || 50 });
        return res.json({ ok: true, stats });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    const { id, fields } = body;
    if (!id || !fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'id and fields required (or trigger:true)' });
    }
    try {
      const updates = Object.assign({}, fields);
      if (String(updates.status || '').toLowerCase() === 'paid' && !updates.paid_at) {
        updates.paid_at = new Date().toISOString();
      }
      const data = await dbx.update('invoices', id, updates);
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Sales meetings — recorded + transcribed calls attached to an existing lead or
// client. Each meeting stores the live transcript, a Claude digest (company
// knowledge), and any generated PRD / SOP. This is the durable per-company
// knowledge base built from real selling conversations.
//
// Collection: sales_meetings
//   { lead_id?, client_id?, contact_id?, account_type, company, account_label,
//     title, sales_stage, transcript, duration_sec, met_on,
//     audio_path, audio_mime, audio_size,   // recording in Firebase Storage
//     summary, knowledge, prd, sop, processed_at, created_at }

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const { id, lead_id, client_id } = req.query;

      if (id) {
        const row = await db.getById('sales_meetings', id);
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.json(row);
      }

      const where = [];
      if (lead_id)   where.push(['lead_id', '==', lead_id]);
      if (client_id) where.push(['client_id', '==', client_id]);

      const rows = await db.list('sales_meetings', {
        where,
        order: 'created_at',
        ascending: false,
        limit: 500,
      });
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.transcript || String(b.transcript).trim().length < 10) {
        return res.status(400).json({ error: 'transcript required' });
      }
      if (!b.lead_id && !b.client_id && !b.audit_id) {
        return res.status(400).json({ error: 'lead_id, client_id, or audit_id required (attach to an account)' });
      }

      // Audit calls are pre-created (scheduled) on booking. Recording upserts into
      // that meeting by audit_id so we never get a duplicate per audit.
      if (b.audit_id) {
        const existing = await db.findOne('sales_meetings', 'audit_id', b.audit_id).catch(() => null);
        if (existing) {
          const updated = await db.update('sales_meetings', existing.id, {
            contact_id:   b.contact_id || existing.contact_id || null,
            prep_brief:   b.prep_brief || existing.prep_brief || null,
            company:      b.company || existing.company || null,
            account_label: b.account_label || existing.account_label || null,
            title:        b.title || existing.title || 'Complete Audit strategy call',
            sales_stage:  b.sales_stage || existing.sales_stage || null,
            transcript:   String(b.transcript),
            duration_sec: b.duration_sec || existing.duration_sec || null,
            status:       'recorded',
            met_on:       existing.met_on || new Date().toISOString().slice(0, 10),
          });
          return res.status(200).json(updated);
        }
      }

      const row = await db.insert('sales_meetings', {
        lead_id:      b.lead_id || null,
        client_id:    b.client_id || null,
        audit_id:     b.audit_id || null,
        contact_id:   b.contact_id || null,
        account_type: b.client_id ? 'client' : (b.audit_id ? 'audit' : 'lead'),
        prep_brief:   b.prep_brief || null,
        company:      b.company || null,
        account_label: b.account_label || b.company || null,
        title:        b.title || 'Sales call',
        sales_stage:  b.sales_stage || null,
        transcript:   String(b.transcript),
        duration_sec: b.duration_sec || null,
        audio_path:   b.audio_path || null,
        audio_mime:   b.audio_mime || null,
        audio_size:   b.audio_size || null,
        met_on:       b.met_on || new Date().toISOString().slice(0, 10),
        summary:      null,
        knowledge:    null,
        prd:          null,
        sop:          null,
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'id required' });
      const { id, ...fields } = b;
      const row = await db.update('sales_meetings', id, fields);
      return res.json(row);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      // Best-effort: delete the recording from Firebase Storage with the doc.
      try {
        const row = await db.getById('sales_meetings', id);
        if (row && row.audio_path) await require('./_storage').remove(row.audio_path);
      } catch (_) {}
      await db.remove('sales_meetings', id);
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

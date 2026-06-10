const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const data = await db.list('applications', { order: 'created_at', ascending: false });
      return res.json(data || []);
    }

    if (req.method === 'PUT') {
      const { id, status, notes } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const data = await db.update('applications', id, { status, notes });

      // Meta Conversions API — application stage change (fire and forget)
      if (status) {
        try {
          const { sendLeadEvent } = require('./_meta-capi');
          const parts = (data.name || '').trim().split(' ');
          sendLeadEvent({
            eventName: status,
            email: data.email,
            phone: data.phone,
            firstName: parts[0] || undefined,
            lastName: parts.slice(1).join(' ') || undefined,
          }).catch(() => {});
        } catch (e) { console.error('Meta CAPI:', e.message); }
      }

      return res.json(data);
    }

    // POST: convert application to lead+contact
    if (req.method === 'POST') {
      const { application_id, action } = req.body || {};
      if (!application_id) return res.status(400).json({ error: 'application_id required' });

      const app = await db.getById('applications', application_id);
      if (!app) return res.status(404).json({ error: 'Application not found' });

      if (action === 'reject') {
        await db.update('applications', application_id, { status: 'rejected' });
        return res.json({ ok: true });
      }

      // Create contact
      const nameParts = (app.name || '').split(' ');
      const contact = await db.insert('contacts', {
        first_name: nameParts[0] || app.name,
        last_name: nameParts.slice(1).join(' ') || null,
        email: app.email,
        phone: app.phone || null,
        company: app.company || null,
        audience: app.audience || null,
        niche: app.niche || null,
      });

      // Create lead
      const lead = await db.insert('leads', {
        contact_id: contact?.id,
        status: 'new',
        source: app.source || 'funnel',
        notes: app.message || null,
      });

      // Link back
      await db.update('applications', application_id, {
        status: 'accepted',
        contact_id: contact?.id,
        lead_id: lead?.id,
      });

      return res.json({ ok: true, contact_id: contact?.id, lead_id: lead?.id });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

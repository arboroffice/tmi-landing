const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await db.list('leads', { order: 'created_at', ascending: false, limit: 500 });
      const data = await db.hydrateMany(rows, 'contact_id', 'contacts', 'contacts');
      return res.json(data);
    }

    if (req.method === 'POST') {
      const { contact, lead } = req.body || {};
      if (!contact?.first_name) return res.status(400).json({ error: 'first_name required' });

      // Upsert contact (check by email if provided)
      let contactId;
      if (contact.email) {
        const existing = await db.findOne('contacts', 'email', contact.email);
        if (existing) {
          contactId = existing.id;
          await db.update('contacts', contactId, contact);
        }
      }
      if (!contactId) {
        const c = await db.insert('contacts', contact);
        contactId = c.id;
      }

      const row = await db.insert('leads', { ...lead, contact_id: contactId });
      const data = await db.hydrateOne(row, 'contact_id', 'contacts', 'contacts');
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { contact, lead } = req.body || {};
      if (!lead?.id) return res.status(400).json({ error: 'lead.id required' });

      // Update contact if provided
      if (contact && contact.first_name) {
        const existing = await db.getById('leads', lead.id);
        if (existing?.contact_id) {
          await db.update('contacts', existing.contact_id, contact);
        }
      }

      const { id, ...leadFields } = lead;
      const row = await db.update('leads', id, leadFields);
      const data = await db.hydrateOne(row, 'contact_id', 'contacts', 'contacts');

      // Meta Conversions API — lead stage change (fire and forget)
      if (leadFields.status) {
        try {
          const { sendLeadEvent } = require('./_meta-capi');
          const c = data.contacts || {};
          sendLeadEvent({
            eventName: data.status || leadFields.status,
            email: c.email || data.email,
            phone: c.phone || data.phone,
            firstName: c.first_name,
            lastName: c.last_name,
          }).catch(() => {});
        } catch (e) { console.error('Meta CAPI:', e.message); }
      }

      // RB2B visitor conversion attribution: when a visitor-sourced lead converts,
      // mark the originating site_visitor so retargeting/lookalikes can learn from it.
      if (leadFields.status && data.source === 'rb2b-visitor') {
        const CONVERTING = ['booked', 'won', 'client', 'building', 'customer', 'onboarding', 'paid'];
        if (CONVERTING.includes(data.status)) {
          // Firestore can't update-by-query; look up every visitor with this
          // lead_id and patch them all (a lead can have multiple visitor hits).
          db.list('site_visitors', { where: [['lead_id', '==', id]] })
            .then(vs => Promise.all(vs.map(v =>
              db.update('site_visitors', v.id, { converted: true, converted_at: new Date().toISOString() }).catch(() => {}))))
            .catch(() => {});
        }
      }

      return res.json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await db.remove('leads', id);
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

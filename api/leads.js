const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('leads')
      .select('*, contacts(*)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { contact, lead } = req.body || {};
    if (!contact?.first_name) return res.status(400).json({ error: 'first_name required' });

    // Upsert contact (check by email if provided)
    let contactId;
    if (contact.email) {
      const existing = await db.from('contacts').select('id').eq('email', contact.email).maybeSingle();
      if (existing.data) {
        contactId = existing.data.id;
        await db.from('contacts').update(contact).eq('id', contactId);
      }
    }
    if (!contactId) {
      const { data: c, error: ce } = await db.from('contacts').insert(contact).select().single();
      if (ce) return res.status(500).json({ error: ce.message });
      contactId = c.id;
    }

    const { data, error } = await db
      .from('leads')
      .insert({ ...lead, contact_id: contactId })
      .select('*, contacts(*)')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { contact, lead } = req.body || {};
    if (!lead?.id) return res.status(400).json({ error: 'lead.id required' });

    // Update contact if provided
    if (contact && contact.first_name) {
      const existing = await db.from('leads').select('contact_id').eq('id', lead.id).single();
      if (existing.data?.contact_id) {
        await db.from('contacts').update(contact).eq('id', existing.data.contact_id);
      }
    }

    const { id, ...leadFields } = lead;
    const { data, error } = await db
      .from('leads')
      .update(leadFields)
      .eq('id', id)
      .select('*, contacts(*)')
      .single();
    if (error) return res.status(500).json({ error: error.message });

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
        db.from('site_visitors')
          .update({ converted: true, converted_at: new Date().toISOString() })
          .eq('lead_id', id).then(() => {}).catch(() => {});
      }
    }

    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('leads').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

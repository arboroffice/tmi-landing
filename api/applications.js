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
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'PUT') {
    const { id, status, notes } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await db
      .from('applications')
      .update({ status, notes })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

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

    const { data: app, error: ae } = await db
      .from('applications')
      .select('*')
      .eq('id', application_id)
      .single();
    if (ae || !app) return res.status(404).json({ error: 'Application not found' });

    if (action === 'reject') {
      await db.from('applications').update({ status: 'rejected' }).eq('id', application_id);
      return res.json({ ok: true });
    }

    // Create contact
    const nameParts = (app.name || '').split(' ');
    const { data: contact } = await db.from('contacts').insert({
      first_name: nameParts[0] || app.name,
      last_name: nameParts.slice(1).join(' ') || null,
      email: app.email,
      phone: app.phone || null,
      company: app.company || null,
      audience: app.audience || null,
      niche: app.niche || null,
    }).select().single();

    // Create lead
    const { data: lead } = await db.from('leads').insert({
      contact_id: contact?.id,
      status: 'new',
      source: app.source || 'funnel',
      notes: app.message || null,
    }).select().single();

    // Link back
    await db.from('applications').update({
      status: 'accepted',
      contact_id: contact?.id,
      lead_id: lead?.id,
    }).eq('id', application_id);

    return res.json({ ok: true, contact_id: contact?.id, lead_id: lead?.id });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

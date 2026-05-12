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
      .from('proposals')
      .select('*, contacts(first_name, last_name, company), leads(status)')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { contact_id, lead_id, title, status, total, sections, expires_at, notes } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const { data, error } = await db.from('proposals').insert({
      contact_id: contact_id || null,
      lead_id: lead_id || null,
      title,
      status: status || 'draft',
      total: total || null,
      sections: sections || null,
      expires_at: expires_at || null,
      notes: notes || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (updates.status === 'sent' && !updates.sent_at) updates.sent_at = new Date().toISOString();
    const { data, error } = await db.from('proposals').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.from('proposals').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

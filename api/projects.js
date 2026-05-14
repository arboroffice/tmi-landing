const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Public single-project read (for prd-view.html shareable links)
  if (req.method === 'GET' && req.query.id && !req.headers.authorization) {
    let db2;
    try { db2 = getSupabase(); } catch(e) { return res.status(503).json({ error: e.message }); }
    const { data, error } = await db2.from('projects').select('id,name,description,notes,status,start_date,end_date,value,created_at').eq('id', req.query.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  }

  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('projects')
      .select('*, clients(contacts(first_name, last_name, company)), contacts(first_name, last_name, company)')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { client_id, contact_id, name, status, start_date, end_date, value, description, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const { data, error } = await db.from('projects').insert({
      client_id: client_id || null,
      contact_id: contact_id || null,
      name,
      status: status || 'scoping',
      start_date: start_date || null,
      end_date: end_date || null,
      value: value || null,
      description: description || null,
      notes: notes || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await db.from('projects').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.from('projects').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

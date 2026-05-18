const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { id, city_lead_id, business_id, completed, overdue } = req.query;

    if (id) {
      const { data, error } = await db.from('city_follow_ups').select('*').eq('id', id).single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }

    let query = db.from('city_follow_ups')
      .select('*, city_businesses(business_name), city_leads(name,city)')
      .order('due_at', { ascending: true }).limit(500);

    if (city_lead_id) query = query.eq('city_lead_id', city_lead_id);
    if (business_id)  query = query.eq('business_id', business_id);
    if (completed !== undefined) query = query.eq('completed', completed === 'true');
    if (overdue === 'true') {
      query = query.lt('due_at', new Date().toISOString()).eq('completed', false);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { city_lead_id, business_id, title, due_at, type, notes, priority } = req.body || {};
    if (!city_lead_id) return res.status(400).json({ error: 'city_lead_id required' });

    const { data, error } = await db.from('city_follow_ups')
      .insert({ city_lead_id, business_id, title, due_at, type, notes, priority, completed: false })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const allowed = ['title','due_at','type','notes','priority','completed','completed_at'];
    const update = {};
    allowed.forEach(k => { if (fields[k] !== undefined) update[k] = fields[k]; });

    const { data, error } = await db.from('city_follow_ups').update(update).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('city_follow_ups').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

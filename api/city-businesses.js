const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { id, city_lead_id, stage, industry } = req.query;

    if (id) {
      const { data, error } = await db
        .from('city_businesses')
        .select('*, city_leads(name, city, state)')
        .eq('id', id)
        .single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }

    let query = db
      .from('city_businesses')
      .select('*, city_leads(name, city, state)')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (city_lead_id) query = query.eq('city_lead_id', city_lead_id);
    if (stage)        query = query.eq('stage', stage);
    if (industry)     query = query.ilike('industry', `%${industry}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { city_lead_id, business_name, contact_name, email, phone, industry, address, notes,
            owner_name, owner_phone, owner_email, owner_linkedin, website, google_place_id,
            city, state, zip, lat, lng, score } = req.body || {};
    if (!business_name) return res.status(400).json({ error: 'business_name required' });

    const { data, error } = await db
      .from('city_businesses')
      .insert({ city_lead_id, business_name, contact_name, email, phone, industry, address, notes,
                owner_name, owner_phone, owner_email, owner_linkedin, website, google_place_id,
                city, state, zip, lat, lng, score, stage: 'seed' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const allowed = ['business_name','contact_name','email','phone','industry','address','stage','notes','last_visit_at','deal_value','signed_at','owner_name','owner_phone','owner_email','owner_linkedin','website','google_place_id','city','state','zip','lat','lng','score','commission'];
    const update = {};
    allowed.forEach(k => { if (fields[k] !== undefined) update[k] = fields[k]; });

    const { data, error } = await db
      .from('city_businesses')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('city_businesses').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { id, status, stage, q } = req.query;

    if (id) {
      const { data, error } = await db
        .from('fotf_members')
        .select('*, fotf_receipts(*), fotf_sprints(*), fotf_stories(*)')
        .eq('id', id)
        .single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }

    let query = db.from('fotf_members').select('*').order('founder_number', { ascending: true });
    if (status) query = query.eq('status', status);
    if (stage) query = query.eq('stage', stage);
    if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,business_name.ilike.%${q}%`);

    const { data, error } = await query.limit(500);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.email) return res.status(400).json({ error: 'email required' });

    const existing = await db.from('fotf_members').select('id').eq('email', body.email).maybeSingle();
    if (existing.data) return res.status(409).json({ error: 'Member with this email already exists' });

    const { data, error } = await db
      .from('fotf_members')
      .insert({ ...body, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Auto-generate receipt record
    await db.from('fotf_receipts').insert({
      member_id: data.id,
      founder_number: data.founder_number,
    });

    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    delete fields.founder_number; // immutable
    fields.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('fotf_members')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db
      .from('fotf_members')
      .update({ status: 'churned', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

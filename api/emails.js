const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const { data, error } = await db.from('email_campaigns').select('*').eq('id', id).single();
      if (error) return res.status(404).json({ error: error.message });
      return res.json(data);
    }
    const { data, error } = await db
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const { data, error } = await db
      .from('email_campaigns')
      .insert({
        subject: body.subject,
        body: body.body,
        from_name: body.from_name || 'TMI',
        from_email: body.from_email,
        reply_to: body.reply_to || null,
        audience_type: body.audience_type || 'all',
        audience_filter: body.audience_filter || null,
        status: body.status || 'draft'
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await db
      .from('email_campaigns')
      .update({
        subject: body.subject,
        body: body.body,
        from_name: body.from_name || 'TMI',
        from_email: body.from_email,
        reply_to: body.reply_to || null,
        audience_type: body.audience_type || 'all',
        audience_filter: body.audience_filter || null,
        status: body.status || 'draft'
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('email_campaigns').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

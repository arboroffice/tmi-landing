const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Reusable email templates for the Comms / Email composer.
// GET    -> list all templates (newest first)
// POST   -> create (or update when an id is supplied) { id?, name, subject, body }
// DELETE -> ?id=<uuid>
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { id, name, subject, body } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const fields = { name, subject: subject || null, body: body || null };
    if (id) {
      const { data, error } = await db.from('email_templates').update(fields).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    const { data, error } = await db.from('email_templates').insert(fields).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('email_templates').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

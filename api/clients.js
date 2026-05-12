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
      .from('clients')
      .select('*, contacts(*)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const { contact, client, contact_id } = req.body || {};

    let cid = contact_id;

    if (!cid && contact?.first_name) {
      // Upsert contact
      if (contact.email) {
        const existing = await db.from('contacts').select('id').eq('email', contact.email).maybeSingle();
        if (existing.data) {
          cid = existing.data.id;
          await db.from('contacts').update(contact).eq('id', cid);
        }
      }
      if (!cid) {
        const { data: c, error: ce } = await db.from('contacts').insert(contact).select().single();
        if (ce) return res.status(500).json({ error: ce.message });
        cid = c.id;
      }
    }

    if (!cid) return res.status(400).json({ error: 'contact or contact_id required' });

    const { data, error } = await db
      .from('clients')
      .insert({ ...(client || {}), contact_id: cid })
      .select('*, contacts(*)')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { contact, client } = req.body || {};
    if (!client?.id) return res.status(400).json({ error: 'client.id required' });

    if (contact?.first_name) {
      const existing = await db.from('clients').select('contact_id').eq('id', client.id).single();
      if (existing.data?.contact_id) {
        await db.from('contacts').update(contact).eq('id', existing.data.contact_id);
      }
    }

    const { id, ...clientFields } = client;
    const { data, error } = await db
      .from('clients')
      .update(clientFields)
      .eq('id', id)
      .select('*, contacts(*)')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

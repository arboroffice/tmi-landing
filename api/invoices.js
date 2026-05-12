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
      .from('invoices')
      .select('*, clients(contacts(first_name, last_name, company)), contacts(first_name, last_name, company)')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { client_id, contact_id, number, amount, status, due_date, description, line_items, notes } = req.body || {};
    if (!amount) return res.status(400).json({ error: 'amount required' });
    const { data, error } = await db.from('invoices').insert({
      client_id: client_id || null,
      contact_id: contact_id || null,
      number: number || null,
      amount,
      status: status || 'pending',
      due_date: due_date || null,
      description: description || null,
      line_items: line_items || null,
      notes: notes || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (updates.status === 'paid' && !updates.paid_at) {
      updates.paid_at = new Date().toISOString();
    }
    const { data, error } = await db.from('invoices').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.from('invoices').delete().eq('id', id);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

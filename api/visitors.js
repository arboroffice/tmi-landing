const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { scoreVisitor } = require('./_visitor-score');

// Admin read/manage for identified site visitors (RB2B).
//   GET            -> list visitors (scored, with dedup/suppression flags)
//   PUT  ?id=      -> update safe fields (linkedin_status)
//   DELETE ?id=    -> remove a visitor row

const OWN_DOMAINS = ['tmitechai.com', 'tmi-technology.com', 'arboroffice.io'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('site_visitors').select('*')
      .order('score', { ascending: false }).order('last_seen', { ascending: false })
      .limit(1000);
    if (error) return res.status(500).json({ error: error.message });

    // Build suppression sets so the UI can flag known people / clients / opt-outs.
    const emails = [...new Set((data || []).map(v => (v.email || v.personal_email || '').toLowerCase()).filter(Boolean))];
    const known = new Set(), unsub = new Set(), clients = new Set();
    if (emails.length) {
      const [c, l, cl] = await Promise.all([
        db.from('contacts').select('email').in('email', emails),
        db.from('leads').select('email,status').in('email', emails),
        db.from('clients').select('email').in('email', emails).then(r => r, () => ({ data: [] })),
      ]);
      (c.data || []).forEach(r => r.email && known.add(r.email.toLowerCase()));
      (l.data || []).forEach(r => { if (r.email && r.status === 'unsubscribed') unsub.add(r.email.toLowerCase()); });
      (cl && cl.data || []).forEach(r => r.email && clients.add(r.email.toLowerCase()));
    }

    const out = (data || []).map(v => {
      const email = (v.email || v.personal_email || '').toLowerCase();
      const domain = email.includes('@') ? email.split('@')[1] : '';
      const score = (v.score != null && v.score > 0) ? v.score : scoreVisitor(v).score;
      return {
        ...v, score,
        flags: {
          known: known.has(email),
          client: clients.has(email),
          unsubscribed: unsub.has(email),
          own_domain: OWN_DOMAINS.includes(domain),
        },
      };
    });
    return res.json(out);
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const body = req.body || {};
    const patch = {};
    if (typeof body.linkedin_status === 'string') patch.linkedin_status = body.linkedin_status;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });
    const { data, error } = await db.from('site_visitors').update(patch).eq('id', id).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await db.from('site_visitors').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

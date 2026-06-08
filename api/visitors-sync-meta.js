const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');
const { addEmailsToAudience } = require('./_meta-audience');

// Bulk-push identified visitor emails into a Meta Custom Audience for retargeting.
// Manual (button on the admin Visitors page). POST { all: true } resyncs everyone
// with an email; otherwise only visitors not yet synced (synced_meta = false).
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const all = !!(req.body && req.body.all);
  let q = db.from('site_visitors').select('id, email, personal_email').limit(10000);
  if (!all) q = q.eq('synced_meta', false);
  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const withEmail = (rows || []).filter(r => r.email || r.personal_email);
  if (!withEmail.length) return res.json({ ok: true, synced: 0, note: 'No visitor emails to sync' });

  const result = await addEmailsToAudience(withEmail.map(r => r.email || r.personal_email));
  if (!result.ok) return res.status(502).json(result);

  const ids = withEmail.map(r => r.id);
  await db.from('site_visitors')
    .update({ synced_meta: true, synced_meta_at: new Date().toISOString() })
    .in('id', ids);

  return res.json({ ok: true, audience_id: result.audience_id, synced: withEmail.length, received: result.received });
};

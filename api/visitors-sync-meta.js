const db = require('./_db');
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

  const all = !!(req.body && req.body.all);
  let rows;
  try {
    rows = await db.list('site_visitors', all
      ? { limit: 10000 }
      : { where: [['synced_meta', '==', false]], limit: 10000 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const withEmail = (rows || []).filter(r => r.email || r.personal_email);
  if (!withEmail.length) return res.json({ ok: true, synced: 0, note: 'No visitor emails to sync' });

  const result = await addEmailsToAudience(withEmail.map(r => r.email || r.personal_email));
  if (!result.ok) return res.status(502).json(result);

  const ids = withEmail.map(r => r.id);
  const syncedAt = new Date().toISOString();
  // Firestore has no bulk "update where id in (...)"; update each doc directly.
  await Promise.all(ids.map(id =>
    db.update('site_visitors', id, { synced_meta: true, synced_meta_at: syncedAt }).catch(() => {})
  ));

  return res.json({ ok: true, audience_id: result.audience_id, synced: withEmail.length, received: result.received });
};

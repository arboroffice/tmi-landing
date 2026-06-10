const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Ops Machine — meeting history (ingested via paste or Fathom webhook).
// GET    -> list (newest first), without the full transcript payload
// DELETE ?id=
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await db.list('os_meetings', { order: 'created_at', ascending: false, limit: 100 });
      // Project to the same columns as before (omit the full transcript payload).
      const out = rows.map(r => ({
        id: r.id, title: r.title, met_on: r.met_on, source: r.source,
        summary: r.summary, extracted: r.extracted, processed_at: r.processed_at, created_at: r.created_at,
      }));
      return res.json(out);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await db.remove('os_meetings', id);
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

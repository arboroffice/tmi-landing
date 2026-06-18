// Intent signals API (admin). Lists the signals the intent agent surfaced and
// lets the operator route or dismiss them.
//
//   GET  /api/signals?status=new        -> newest first
//   PATCH /api/signals  { id, status }   -> 'routed' | 'dismissed' | 'new'

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const status = (req.query && req.query.status) || null;
      const where = status ? [['status', '==', status]] : [];
      const rows = await dbx.list('signals', { where, limit: 300 }).catch(() => []);
      rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return res.json(rows);
    }

    if (req.method === 'PATCH') {
      const { id, status } = req.body || {};
      if (!id || !status) return res.status(400).json({ error: 'id and status required' });
      const updated = await dbx.update('signals', id, { status, status_at: new Date().toISOString() });
      return res.json(updated);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

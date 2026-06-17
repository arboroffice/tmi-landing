// Do-not-contact list management (admin). GET lists, POST adds an email/domain.

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await dbx.list('suppression', { order: 'added_at', ascending: false, limit: 500 });
      return res.json(rows);
    }
    if (req.method === 'POST') {
      const { email, domain, reason } = req.body || {};
      if (!email && !domain) return res.status(400).json({ error: 'email or domain required' });
      const lc = email ? String(email).toLowerCase().trim() : null;
      const dm = domain ? String(domain).toLowerCase().trim() : (lc ? lc.split('@')[1] : null);
      const row = await dbx.insert('suppression', { email: lc, domain: dm, reason: reason || 'manual', added_at: new Date().toISOString() });
      return res.status(201).json(row);
    }
    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

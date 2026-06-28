// Admin: the monthly client value reports (QBR) the client-success agent generates.
const { cors, requireAuth } = require('./_auth');
const db = require('./_db');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  try {
    const where = req.query.client_id ? [['client_id', '==', req.query.client_id]] : [];
    return res.json(await db.list('qbr_reports', { where, order: 'created_at', ascending: false, limit: 300 }));
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

// Admin observability: recent GTM agent runs (gtm_runs collection).

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    const runs = await dbx.list('gtm_runs', { order: 'ran_at', ascending: false, limit: 25 });
    return res.json(runs);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

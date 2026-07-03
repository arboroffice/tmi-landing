// A rep's recorded interactions (transcript + AI recap), for the lead timeline.
//   GET ?lead_id=<id>  -> [ interactions ] (this rep's, newest first)
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const rep = await requireRep(req, res); if (!rep) return;
  const leadId = req.query && req.query.lead_id;
  try {
    const where = [['rep_id', '==', rep.sub]];
    if (leadId) where.push(['lead_id', '==', leadId]);
    const rows = await db.list('rep_interactions', { where, order: 'created_at', ascending: false, limit: 100 });
    return res.json(rows || []);
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

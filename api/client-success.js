// Client Success + QBR — health snapshots and monthly value reports.
// GET  /api/client-success           -> client_health rows (newest first)
// GET  /api/client-success?summary=1 -> counts by band (healthy | watch | at_risk)
// PATCH/POST /api/client-success { id, fields }   -> update a client_health row
// PATCH/POST /api/client-success { trigger:true }  -> run the agent

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query.summary) {
        const bands = ['healthy', 'watch', 'at_risk'];
        const counts = {};
        await Promise.all(bands.map(async b => {
          counts[b] = await dbx.count('client_health', [['band', '==', b]]).catch(() => 0);
        }));
        return res.json({ counts });
      }
      const where = req.query.band ? [['band', '==', req.query.band]] : [];
      const rows = await dbx.list('client_health', { where, order: 'computed_at', ascending: false, limit: 500 });
      return res.json(rows);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = req.body || {};

      if (body.trigger) {
        const { runClientSuccess } = await import('../agents/gtm/client-success.js');
        runClientSuccess(body.options || {}).catch(err => console.error('client-success error:', err));
        return res.json({ ok: true, message: 'Client Success run started' });
      }

      const { id, fields } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const patch = Object.assign({}, fields || {}, { updated_at: new Date().toISOString() });
      await dbx.update('client_health', id, patch);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

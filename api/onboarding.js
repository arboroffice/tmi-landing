const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

// Onboarding admin endpoint.
//   GET                 -> list onboarding records, newest first
//   GET ?summary=1      -> counts by stage
//   PATCH/POST {id,...} -> update an onboarding record (status or arbitrary fields)
//   PATCH/POST {trigger:true} -> fire the onboarding agent (dynamic import, ESM)
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query && (req.query.summary === '1' || req.query.summary === 'true')) {
        const rows = await dbx.list('onboarding', { order: 'created_at', ascending: false, limit: 1000 });
        const byStage = {};
        for (const r of rows) {
          const stage = (r && r.stage) || 'unknown';
          byStage[stage] = (byStage[stage] || 0) + 1;
        }
        return res.json({ total: rows.length, byStage });
      }
      const rows = await dbx.list('onboarding', { order: 'created_at', ascending: false, limit: 500 });
      return res.json(rows);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = req.body || {};

      if (body.trigger === true) {
        const limit = body.limit ? Number(body.limit) : undefined;
        const mod = await import('../agents/gtm/onboarding.js');
        // Run async without blocking the HTTP response.
        mod.runOnboarding({ limit }).catch(err => console.error('Onboarding agent error:', err));
        return res.json({ ok: true, message: 'Onboarding agent started' });
      }

      const { id, status, fields } = body;
      if (!id) return res.status(400).json({ error: 'id required' });

      const patch = Object.assign({}, fields || {});
      if (status != null) patch.stage = status;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'status or fields required' });

      const row = await dbx.update('onboarding', id, patch);
      return res.json(row);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

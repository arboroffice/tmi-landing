// TMI OS - the action log (in-app). Any signed-in member of the company can read
// the recent record of what its workers and people did.
//
// POST { action:'list', limit? } -> { audit }

const audit = require('./_osaudit');
const { requireTenant, cors } = require('./_tenant-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (require('./_oslabs').labsClosed(res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = String(b.action || 'list');
  const tid = t.tenant_id;

  try {
    if (action === 'list') {
      const limit = Number(b.limit) > 0 ? Number(b.limit) : 50;
      return res.status(200).json({ audit: await audit.list(tid, { limit }) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-audit:', e.message);
    return res.status(500).json({ error: 'Could not load the action log' });
  }
};

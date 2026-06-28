// Expansion / Upsell opportunities — admin API.
//
// GET                 list expansion opportunities, newest first (hydrated with client + contact)
// GET ?summary=1      counts by stage (identified / proposed / won / lost)
// PATCH | POST        { id, stage } or { id, ...fields }  -> update one opportunity
// POST { trigger:true }                                   -> run the expansion agent
//
// Auth: admin JWT (requireAuth). The agent run is dynamically imported so this
// serverless function stays lightweight when only listing.

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

const STAGES = ['identified', 'proposed', 'won', 'lost'];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query && (req.query.summary === '1' || req.query.summary === 'true')) {
        const counts = {};
        await Promise.all(STAGES.map(async (s) => {
          counts[s] = await dbx.count('expansion_opportunities', [['stage', '==', s]]).catch(() => 0);
        }));
        const total = await dbx.count('expansion_opportunities', []).catch(() => 0);
        return res.json({ total, counts });
      }

      const rows = await dbx.list('expansion_opportunities', {
        order: 'created_at', ascending: false, limit: 500,
      });
      const withClient = await dbx.hydrateMany(rows, 'client_id', 'clients', 'client');
      const clients = withClient.map(r => r.client).filter(Boolean);
      await dbx.hydrateMany(clients, 'contact_id', 'contacts', 'contact');
      return res.json(withClient);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = req.body || {};

      if (body.trigger === true) {
        const { runExpansion } = await import('../agents/gtm/expansion.js');
        runExpansion(body.options || {}).catch(err => console.error('expansion run error:', err));
        return res.json({ ok: true, message: 'Expansion agent started' });
      }

      const { id, stage, ...rest } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      if (stage && !STAGES.includes(stage)) {
        return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
      }

      const fields = { ...rest };
      if (stage) fields.stage = stage;
      delete fields.trigger;
      delete fields.options;
      fields.updated_at = new Date().toISOString();

      const row = await dbx.update('expansion_opportunities', id, fields);
      return res.json(row);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

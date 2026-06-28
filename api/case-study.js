// Case-study / testimonial / referral admin endpoint.
//
// GET                -> list case studies, newest first
// GET ?summary=1     -> counts by status (draft / requested / received / published)
// PATCH / POST       -> { id, status | fields }  update a case study
//                       { trigger:true }          run the agent (runCaseStudies)

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query && (req.query.summary === '1' || req.query.summary === 'true')) {
        const summary = {};
        for (const status of ['draft', 'requested', 'received', 'published']) {
          summary[status] = await dbx.count('case_studies', [['status', '==', status]]).catch(() => 0);
        }
        summary.total = await dbx.count('case_studies', []).catch(() => 0);
        return res.json(summary);
      }
      const rows = await dbx.list('case_studies', { order: 'created_at', ascending: false, limit: 500 });
      const data = await dbx.hydrateMany(rows, 'client_id', 'clients', 'client');
      return res.json(data);
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = req.body || {};

      // Run the agent.
      if (body.trigger === true) {
        const mod = await import('../agents/gtm/case-study.js');
        const stats = await mod.runCaseStudies({ limit: body.limit }).catch(err => {
          console.error('case-study trigger error:', err);
          return { error: err.message };
        });
        return res.json({ ok: true, stats });
      }

      // Update one case study.
      const { id, status, ...rest } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const fields = { ...rest };
      if (status) fields.status = status;
      delete fields.trigger;
      delete fields.limit;
      if (!Object.keys(fields).length) return res.status(400).json({ error: 'status or fields required' });
      fields.updated_at = new Date().toISOString();
      const row = await dbx.update('case_studies', id, fields);
      const data = await dbx.hydrateOne(row, 'client_id', 'clients', 'client');
      return res.json(data);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// AI research for the Intelligent Company Audit. Takes the lead's company/email,
// researches what is publicly knowable, and returns pre-fill values + a "what we
// found" summary so the audit only asks the owner for what only they know.
// Best-effort: stashes the research on the contact so it is captured even if the
// lead never finishes the intake.

const { cors } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { company, website, email } = req.body || {};
  if (!company && !website && !email) return res.status(400).json({ ok: false, error: 'company, website, or email required' });

  try {
    const { researchForAudit } = await import('../agents/gtm/audit-research.js');
    const r = await researchForAudit({ company, website, email });

    // Capture the research on the contact (created at the gate via /api/subscribe)
    // so the team sees it and the deliverable can be grounded in it.
    try {
      if (email) {
        const c = await dbx.findOne('contacts', 'email', String(email).toLowerCase());
        if (c) await dbx.update('contacts', c.id, { research: r, researched_at: new Date().toISOString() });
      }
    } catch (e) { console.error('audit-research stash:', e.message); }

    return res.json(Object.assign({ ok: true }, r));
  } catch (e) {
    console.error('audit-research:', e.message);
    return res.status(200).json({ ok: false, error: e.message, prefill: {}, found: [], summary: '' });
  }
};

// The fetch + Claude call can take ~15-25s; give it headroom.
module.exports.config = { maxDuration: 60 };

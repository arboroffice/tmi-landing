// Diagnosis pass for the Intelligent Company Audit. Takes the verified dossier
// (research + the owner's confirmed answers) and returns the specific problems in
// their operation, what each costs, and the TMI fix + path for each. Best-effort.

const { cors } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { company, industry, research, answers, email } = req.body || {};

  try {
    const { diagnoseOperation } = await import('../agents/gtm/audit-diagnose.js');
    const d = await diagnoseOperation({ company, industry, research: research || null, answers: answers || {} });

    // Stash on the contact so the team sees the diagnosis even if the lead never
    // finishes, and the deliverable can be grounded in it.
    try {
      if (email) {
        const c = await dbx.findOne('contacts', 'email', String(email).toLowerCase());
        if (c) await dbx.update('contacts', c.id, { diagnosis: d, diagnosed_at: new Date().toISOString() });
      }
    } catch (e) { console.error('diagnose stash:', e.message); }

    return res.json(Object.assign({ ok: true }, d));
  } catch (e) {
    console.error('audit-diagnose:', e.message);
    return res.status(200).json({ ok: false, error: e.message, issues: [], headline: '', summary: '' });
  }
};

module.exports.config = { maxDuration: 60 };

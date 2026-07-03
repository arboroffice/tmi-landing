// Generate an Intelligent Company Preview (the positive outside read) for any
// company, on demand from the admin. Admin-authed. Powers the preview asset.
//   POST { company, website?, email? } -> { ...preview }
const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAuth(req, res)) return;

  const { company, website, email } = req.body || {};
  if (!company && !website && !email) return res.status(400).json({ error: 'company, website, or email required' });

  try {
    const { generatePreview } = await import('../agents/gtm/preview.js');
    const preview = await generatePreview({ company, website, email });
    // Best-effort: stash on the contact so the preview is captured for the team.
    try {
      if (email) {
        const c = await dbx.findOne('contacts', 'email', String(email).toLowerCase());
        if (c) await dbx.update('contacts', c.id, { preview, previewed_at: new Date().toISOString() });
      }
    } catch (e) { console.error('preview stash:', e.message); }
    return res.json(Object.assign({ ok: true }, preview));
  } catch (e) {
    console.error('company-preview:', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
};

// Research + Claude can take ~15-25s.
module.exports.config = { maxDuration: 60 };

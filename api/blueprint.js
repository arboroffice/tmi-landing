// Generate a build-proposal draft from a stored audit (admin). Saves it and emails
// the team. Used after a discovery call to scope the Intelligent Company OS build.

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAuth(req, res)) return;

  const { slug, leadId } = req.body || {};
  try {
    let audit = slug ? await dbx.getById('prospect_audits', slug) : null;
    const lead = leadId ? await dbx.getById('leads', leadId) : null;
    if (!audit && lead && lead.audit_slug) audit = await dbx.getById('prospect_audits', lead.audit_slug);
    if (!audit) return res.status(404).json({ error: 'audit not found for this prospect' });

    const research = {
      primaryPain: lead && lead.research_notes,
      signals: lead && lead.signals ? String(lead.signals).split(', ').filter(Boolean) : [],
      techStack: [],
    };

    const { buildBlueprint } = await import('../agents/gtm/blueprint.js');
    const content = await buildBlueprint({ companyName: audit.companyName, industry: audit.industry, audit, research });

    const saved = await dbx.insert('blueprints', {
      slug: slug || (lead && lead.audit_slug) || null,
      lead_id: leadId || audit.leadId || null,
      company: audit.companyName,
      content,
      created_at: new Date().toISOString(),
    });

    // Email the team a copy.
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend');
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: 'TMI <support@tmitechai.com>',
          to: process.env.GTM_DIGEST_EMAIL || 'support@tmitechai.com',
          subject: `Build proposal draft: ${audit.companyName}`,
          text: content,
        });
      }
    } catch (e) { console.error('blueprint email:', e.message); }

    return res.json({ ok: true, id: saved && saved.id, company: audit.companyName, content });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// Enroll a (warm/inbound) contact into the outbound machine: creates the lead and
// runs the full per-lead pipeline (research -> audit -> send/sequence). Admin-only.

const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAuth(req, res)) return;

  const { email, name, company, website, title, linkedin_url } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid email required' });
  const lc = email.toLowerCase().trim();

  try {
    if (await dbx.findOne('suppression', 'email', lc)) {
      return res.status(409).json({ error: 'address is on the do-not-contact list' });
    }
    let lead = await dbx.findOne('leads', 'email', lc);
    if (!lead) {
      lead = await dbx.insert('leads', {
        email: lc,
        company_name: company || null,
        owner_name: name || null,
        owner_title: title || null,
        website: website || null,
        linkedin_url: linkedin_url || null,
        source: 'inbound',
        status: 'new',
        outreach_count: 0,
      });
    }
    const { processLead } = await import('../agents/gtm/outbound.js');
    processLead(lead).catch(e => console.error('enroll processLead:', e));
    return res.json({ ok: true, leadId: lead.id, message: `Enrolling ${lc}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

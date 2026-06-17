// Generates the pre-call intelligence brief for a booked audit and emails it to
// the team. Invoked via QStash from booking-confirmed.js so it runs reliably as a
// background job (the Claude + Apollo research takes ~10-20s).

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { companyName, contactName, contactEmail, website, leadId, submissionId, applicationId } = req.body || {};
  if (!companyName && !contactEmail) {
    return res.status(400).json({ error: 'companyName or contactEmail required' });
  }

  try {
    const { prepAudit } = await import('../agents/gtm/audit-prep.js');
    const result = await prepAudit({ companyName, contactName, contactEmail, website, leadId });

    // Attach the brief to the audit record so it is ready in the call workspace.
    if (result && result.briefing && (submissionId || applicationId)) {
      try {
        const dbx = require('./_db');
        const patch = { prep_brief: result.briefing, prep_at: new Date().toISOString() };
        if (submissionId) await dbx.update('audit_submissions', submissionId, patch);
        if (applicationId) await dbx.update('applications', applicationId, patch);
      } catch (e) { console.error('attach prep:', e.message); }
    }

    return res.json({ ok: true, company: result?.company });
  } catch (e) {
    console.error('audit-prep error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

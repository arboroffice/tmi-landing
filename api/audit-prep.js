// Generates the pre-call intelligence brief for a booked audit and emails it to
// the team. Invoked via QStash from booking-confirmed.js so it runs reliably as a
// background job (the Claude + Apollo research takes ~10-20s).

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { companyName, contactName, contactEmail, website, leadId } = req.body || {};
  if (!companyName && !contactEmail) {
    return res.status(400).json({ error: 'companyName or contactEmail required' });
  }

  try {
    const { prepAudit } = await import('../agents/gtm/audit-prep.js');
    const result = await prepAudit({ companyName, contactName, contactEmail, website, leadId });
    return res.json({ ok: true, company: result?.company });
  } catch (e) {
    console.error('audit-prep error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

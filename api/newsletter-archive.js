const db = require('./_db');
const { renderIssue, SITE } = require('./_newsletter-render');

// Public archive ("the vault") for Founders of the Future Letters.
// Only issues with status 'sent' are ever exposed - drafts and tests stay private.
//   GET            -> { issues: [{id,title,subject,sent_at,format}] } (newest first)
//   GET ?id=<id>   -> the rendered letter as a standalone HTML page
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (id) {
    let issue = null;
    try {
      const found = await db.getById('newsletter_issues', id);
      if (found && found.status === 'sent') issue = found;
    } catch (e) { /* fall through to the not-available page */ }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!issue) return res.status(404).send('<!doctype html><meta charset="utf-8"><body style="font-family:Arial;max-width:480px;margin:80px auto;text-align:center;color:#555;">That issue is not available.<br><a href="/founders-vault" style="color:#0a7a3a;">Back to the vault</a></body>');
    return res.status(200).send(renderIssue(issue, SITE + '/api/nl-unsubscribe'));
  }

  try {
    // Filter by status in Firestore, then sort by sent_at desc in JS to avoid a
    // composite (status + sent_at) index requirement.
    const rows = await db.list('newsletter_issues', { where: [['status', '==', 'sent']], limit: 500 });
    rows.sort((a, b) => String(b.sent_at || '').localeCompare(String(a.sent_at || '')));
    const issues = rows.map(r => ({ id: r.id, title: r.title, subject: r.subject, sent_at: r.sent_at, format: r.format }));
    return res.json({ issues });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

// Serves the branded, hosted Complete Audit report for a paid submission.
// GET /audit-report?id=<submissionId>  (the id is an unguessable Firestore id)

const dbx = require('./_db');
const { renderReportPage } = require('./_audit-report-render');

function notFound(res, msg) {
  res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><meta charset="utf-8"><title>Not found</title><div style="font-family:system-ui;padding:60px;text-align:center;color:#555">${msg || 'This audit could not be found.'} <a href="https://www.tmitechai.com/complete-audit">Start the Complete Audit</a></div>`);
}

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  if (!id) return notFound(res, 'No audit id provided.');

  let sub;
  try { sub = await dbx.getById('audit_submissions', id); }
  catch (e) { return notFound(res, 'This audit could not be found.'); }
  if (!sub) return notFound(res, 'This audit could not be found.');

  const md = sub.deliverable;
  if (!md) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html><meta charset="utf-8"><title>Preparing your audit</title>
<meta http-equiv="refresh" content="20"/>
<div style="font-family:system-ui;max-width:480px;margin:80px auto;text-align:center;color:#444;line-height:1.6">
<h2 style="font-weight:600">Your audit is being prepared</h2>
<p>This takes a minute or two. The page will refresh automatically, and we are also emailing it to you.</p></div>`);
  }

  const html = renderReportPage({
    company: sub.company || (sub.answers && sub.answers.company) || '',
    md,
    date: sub.delivered_at || sub.created_at,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(html);
};

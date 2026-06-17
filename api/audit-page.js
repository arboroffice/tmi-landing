// Dynamic personalized audit microsite: /audit/<slug> -> renders from the
// prospect_audits Firestore record. Live the instant the agent stores it, no
// deploy lag. Falls back to a committed static file if one exists.

const fs = require('fs');
const path = require('path');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return res.status(404).send('Not found');

  try {
    const data = await dbx.getById('prospect_audits', slug);
    if (data) {
      const { renderAuditPage } = await import('../agents/gtm/audit-site.js');
      const html = renderAuditPage({ ...data, slug });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).send(html);
    }
  } catch (e) {
    console.error('audit-page render error:', e.message);
  }

  // Fallback: committed static page (e.g. the demo)
  const staticFile = path.join(__dirname, '..', 'audit', `${slug}.html`);
  if (fs.existsSync(staticFile)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(fs.readFileSync(staticFile, 'utf8'));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(404).send('<!doctype html><meta charset="utf-8"><title>Not found</title><div style="font-family:system-ui;padding:60px;text-align:center;color:#555">This review link has expired or moved. <a href="https://www.tmitechai.com/audit">Take the audit</a></div>');
};

// Dynamic personalized executive card image (PNG), rendered from the
// prospect_audits Firestore record (or query params). Node runtime: uses
// satori + @resvg/resvg-js via the shared renderer. Used as the audit og:image
// and as the inline image in the Instantly cold email ({{audit_card}}).

const dbx = require('./_db');

module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    let companyName = q.company;
    let score = q.score;
    let industry = q.industry;

    const slug = String(q.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug) {
      const data = await dbx.getById('prospect_audits', slug);
      if (data) {
        companyName = data.companyName || companyName;
        score = data.score != null ? data.score : score;
        industry = data.industry || industry;
      }
    }
    if (!companyName) return res.status(400).send('company or slug required');

    const { renderCardPng } = await import('../agents/gtm/audit-card.js');
    const png = await renderCardPng({ companyName, score, industry });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(png);
  } catch (e) {
    console.error('audit-card error:', e.message);
    return res.status(500).send('card error');
  }
};

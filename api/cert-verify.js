// Public verification of an Intelligent Company Certified credential. No auth:
// anyone with the public id (a buyer, a partner) can check it is real. Returns
// only the safe public facts, never the member's areas or owner-dependency.
//
// GET|POST ?id=<public_id> -> { valid, company, score, level_name, issued_at }

const db = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const id = String((req.query && req.query.id) || (req.body && req.body.id) || '').trim();
  if (!id) return res.status(400).json({ valid: false });
  try {
    const rows = await db.list('os_certifications', { where: [['public_id', '==', id]], limit: 1 });
    const c = rows[0];
    if (!c || c.status !== 'active') return res.status(200).json({ valid: false });
    return res.status(200).json({
      valid: true,
      company: c.company || 'A company',
      score: c.score,
      level_name: c.level_name || null,
      issued_at: c.issued_at || null,
    });
  } catch (e) {
    console.error('cert-verify:', e.message);
    return res.status(200).json({ valid: false });
  }
};

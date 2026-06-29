const db = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, phone, source, sources, audience, niche, name } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  // Accept a single `source` or a `sources` array (e.g. ['founders-of-the-future']).
  const tagList = (Array.isArray(sources) && sources.length) ? sources.filter(Boolean)
    : (source ? [source] : []);

  const emailNorm = email.toLowerCase().trim();
  const first_name = name ? name.trim().split(' ')[0] : emailNorm.split('@')[0];
  const last_name = name && name.includes(' ') ? name.trim().split(' ').slice(1).join(' ') : null;

  try {
    const existing = await db.findOne('contacts', 'email', emailNorm);
    if (existing) {
      // Merge any new tags onto the existing contact (idempotent re-subscribe).
      const merged = [...new Set([...(existing.tags || []), ...tagList])];
      await db.update('contacts', existing.id, {
        tags: merged,
        unsubscribed: false,
        audience: existing.audience || audience || null,
        niche: existing.niche || niche || null,
      });
      return res.status(200).json({ success: true, existing: true });
    }

    await db.insert('contacts', {
      first_name,
      last_name,
      email: emailNorm,
      phone: phone || null,
      audience: audience || null,
      niche: niche || null,
      tags: tagList,
      unsubscribed: false,
    });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

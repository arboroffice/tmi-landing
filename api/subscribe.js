const { getSupabase } = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, source, audience, niche, name } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const first_name = name ? name.trim().split(' ')[0] : email.split('@')[0];
  const last_name = name && name.includes(' ') ? name.trim().split(' ').slice(1).join(' ') : null;

  const row = {
    first_name,
    last_name,
    email: email.toLowerCase().trim(),
    audience: audience || null,
    niche: niche || null,
    tags: source ? [source] : null,
    unsubscribed: false,
  };

  // Resilience: optional columns (tags, unsubscribed) may not be migrated yet.
  // Drop whichever column the schema reports as missing and retry, so the signup
  // still succeeds. Run supabase-newsletter.sql to add them for full functionality.
  let error;
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ error } = await db.from('contacts').upsert(row, { onConflict: 'email' }));
    if (!error) break;
    const m = /find the '(\w+)' column/i.exec(error.message || '');
    if (m && Object.prototype.hasOwnProperty.call(row, m[1])) { delete row[m[1]]; continue; }
    break;
  }

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
};

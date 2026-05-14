const { getSupabase } = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, source, audience, niche, name } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  const customFields = [];
  if (audience) customFields.push({ name: 'Audience', value: audience });
  if (niche) customFields.push({ name: 'Business Niche', value: niche });

  // Beehiiv subscribe
  try {
    const r = await fetch(
      'https://api.beehiiv.com/v2/publications/pub_24a9962f-7b4a-4587-b363-263e5508e73c/subscriptions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.BEEHIIV_API_KEY,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: true,
          utm_source: source || 'website',
          utm_medium: 'inline_form',
          ...(customFields.length ? { custom_fields: customFields } : {}),
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }

  // Also write to Supabase contacts (non-blocking — if not configured, skip)
  try {
    const db = getSupabase();
    const first_name = name
      ? name.trim().split(' ')[0]
      : email.split('@')[0];
    const last_name = name && name.includes(' ')
      ? name.trim().split(' ').slice(1).join(' ')
      : null;

    await db.from('contacts').upsert({
      first_name,
      last_name,
      email: email.toLowerCase().trim(),
      audience: audience || null,
      niche: niche || null,
      tags: source ? [source] : null,
    }, { onConflict: 'email' });
  } catch (_) {
    // Supabase not configured yet — skip silently
  }

  return res.status(200).json({ success: true });
};

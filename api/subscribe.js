module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, source } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

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
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

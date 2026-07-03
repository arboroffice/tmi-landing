// Scan a business card / storefront sign into lead fields using Claude vision
// (no separate OCR service needed). Rep-scoped.
//   POST { image: dataURL } -> { fields: { business_name, contact_name, title, phone, email, website, industry } }
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const rep = await requireRep(req, res); if (!rep) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Scanning is not configured' });

  const b = req.body || {};
  const image = b.image;
  if (!image || typeof image !== 'string' || !image.startsWith('data:')) return res.status(400).json({ error: 'An image data URL is required' });
  const m = image.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return res.status(400).json({ error: 'Image must be a base64 data URL' });
  let media_type = (m[1] || 'image/jpeg').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(media_type)) media_type = 'image/jpeg';
  const data = m[2];
  if (!data) return res.status(400).json({ error: 'Empty image' });

  const prompt = 'This is a photo of a business card or a storefront/company sign. Extract the business details as STRICT JSON only, no prose, with keys: "business_name","contact_name","title","phone","email","website","industry". Use "" for anything not visible.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type, data } },
          { type: 'text', text: prompt },
        ] }],
      }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); console.error('scan-card', r.status, t.slice(0, 200)); return res.status(502).json({ error: 'Scan failed', status: r.status }); }
    const d = await r.json();
    const txt = (d && d.content && d.content[0] && d.content[0].text) || '';
    const jm = txt.match(/\{[\s\S]*\}/);
    if (!jm) return res.json({ fields: null });
    const o = JSON.parse(jm[0]);
    const s = (v) => String(v || '').slice(0, 160);
    return res.json({ fields: {
      business_name: s(o.business_name), contact_name: s(o.contact_name), title: s(o.title),
      phone: s(o.phone), email: s(o.email), website: s(o.website), industry: s(o.industry),
    } });
  } catch (e) { console.error('scan-card', e.message); return res.status(500).json({ error: e.message }); }
};

module.exports.config = { maxDuration: 30 };

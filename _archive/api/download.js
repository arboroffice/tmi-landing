// Gated download: requires an email, logs the grab (lead capture), returns the file URL.
const db = require('./_db');
const { cors } = require('./_auth');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { slug, email, name, phone } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug required' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email required' });
  const em = String(email).toLowerCase().trim();
  try {
    const resource = await db.findOne('library_resources', 'slug', slug);
    if (!resource) return res.status(404).json({ error: 'Not found' });
    await db.insert('downloads', { slug, title: resource.title || slug, email: em, name: name || null, phone: phone || null, created_at: new Date().toISOString() });
    // capture
    if (!(await db.findOne('leads', 'email', em))) {
      await db.insert('leads', { email: em, owner_name: name || null, phone: phone || null, source: `download:${slug}`, status: 'new', score: 'warm', unsubscribed: false, created_at: new Date().toISOString() });
    }
    try { await db.upsertByField('contacts', 'email', em, { email: em, tags: ['download'] }); } catch {}
    return res.json({ ok: true, url: resource.file_url || resource.url || null, title: resource.title || slug });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

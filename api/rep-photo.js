// Lead photos for the city-lead portal. Uploads go through the server (admin
// SDK) into Firebase Storage, so they work for any signed-in rep and need no
// permissive Storage rules. Client downscales before sending to stay small.
//   GET  ?lead_id=<id>                 -> [ { id, url, created_at } ]
//   POST { image: dataURL, lead_id? }  -> { id, url }
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const BUCKET = 'tmitech-e264c.firebasestorage.app';
const MAX = 5 * 1024 * 1024; // ~5MB data URL cap

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const rep = await requireRep(req, res); if (!rep) return;

  if (req.method === 'GET') {
    const leadId = req.query && req.query.lead_id;
    try {
      const where = [['rep_id', '==', rep.sub]];
      if (leadId) where.push(['lead_id', '==', leadId]);
      const rows = await db.list('rep_photos', { where, order: 'created_at', ascending: false, limit: 60 });
      return res.json(rows || []);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};
  const image = b.image;
  if (!image || typeof image !== 'string' || !image.startsWith('data:')) return res.status(400).json({ error: 'An image data URL is required' });
  if (image.length > MAX) return res.status(413).json({ error: 'Photo too large. It should be downscaled before upload.' });
  const m = image.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return res.status(400).json({ error: 'Image must be a base64 data URL' });
  const contentType = m[1] || 'image/jpeg';
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) return res.status(400).json({ error: 'Empty image' });

  try {
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `rep-photos/${rep.sub}/${b.lead_id || 'unassigned'}/${Date.now()}.${ext}`;
    const file = db.admin.storage().bucket(BUCKET).file(path);
    await file.save(buf, { contentType, resumable: false, metadata: { cacheControl: 'public, max-age=31536000' } });
    const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
    const rec = await db.insert('rep_photos', { rep_id: rep.sub, lead_id: b.lead_id || null, url, path, created_at: new Date().toISOString() });
    return res.json({ id: rec.id, url });
  } catch (e) { console.error('rep-photo', e.message); return res.status(500).json({ error: e.message }); }
};

module.exports.config = { maxDuration: 30 };

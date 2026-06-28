// Lightweight site search across DB-backed catalog content (library, podcast, courses, events).
const db = require('./_db');
const { cors } = require('./_auth');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json({ q, results: [] });
  const hay = (r) => `${r.title || ''} ${r.description || r.summary || ''} ${r.tags ? (Array.isArray(r.tags) ? r.tags.join(' ') : r.tags) : ''}`.toLowerCase();
  const safe = (p) => p.catch(() => []);
  try {
    const sources = [
      ['library', 'library_resources'], ['podcast', 'podcast_episodes'],
      ['course', 'courses'], ['event', 'events'],
    ];
    const out = [];
    for (const [type, coll] of sources) {
      const rows = await safe(db.list(coll, { limit: 300 }));
      for (const r of rows) {
        if ((r.status == null || r.status === 'published') && hay(r).includes(q)) {
          out.push({ type, id: r.id, title: r.title || r.slug || '(untitled)', description: r.description || r.summary || '', url: r.url || r.file_url || null, slug: r.slug || null });
        }
      }
    }
    return res.json({ q, count: out.length, results: out.slice(0, 50) });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

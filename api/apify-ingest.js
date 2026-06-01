const { getSupabase } = require('./_supabase');
const { verifyToken, cors } = require('./_auth');

// Ops Machine — Apify ingestion.
//
// One endpoint that accepts results from any of the connected Apify scrapers
// and routes them into the right table:
//   target=content    -> content_ideas      (Reddit / IG / TikTok / Threads topic mining)
//   target=media      -> os_social_posts    (post metrics for the Initiatives media tab)
//   target=candidates -> os_candidates       (LinkedIn sourcing into the recruiting pipeline)
//   target=ads        -> os_competitor_ads   (Google / Facebook ad library)
//
// How items arrive:
//   - Apify webhook on run finish: body has resource.defaultDatasetId -> we fetch
//     the dataset items via the Apify API (needs APIFY_TOKEN).
//   - Or pass items inline: { items: [...] } (e.g. when triggered from elsewhere).
//   - Or pass a dataset id directly: { datasetId: "..." }.
//
// target + source come from the query string (?target=media&source=tiktok) or body.
// Auth: admin JWT, or header x-apify-secret === APIFY_INGEST_SECRET.

const pick = (o, keys) => { for (const k of keys) { if (o && o[k] != null && o[k] !== '') return o[k]; } return null; };
const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[, ]/g, '')); return isNaN(n) ? null : n; };

function mapItem(target, source, it) {
  if (target === 'content') {
    const text = pick(it, ['text','body','caption','content','snippet','title']);
    const url = pick(it, ['url','postUrl','link','permalink','postLink']);
    const title = (pick(it, ['title','headline']) || (text ? String(text).slice(0, 120) : null) || 'Untitled');
    return { _key: url, row: { title, hook: null, notes: text || null, status: 'idea', post_url: url, platforms: source ? [source] : null } };
  }
  if (target === 'media') {
    const url = pick(it, ['webVideoUrl','url','postUrl','link','permalink']);
    return { _key: url, row: {
      platform: source || pick(it, ['platform']),
      author: pick(it, ['authorMeta.name','ownerUsername','author','username','authorName']) || (it.authorMeta && it.authorMeta.name) || null,
      url, text: pick(it, ['text','caption','title','description']),
      likes: num(pick(it, ['diggCount','likesCount','likes','hearts','likeCount'])),
      comments: num(pick(it, ['commentCount','commentsCount','comments'])),
      shares: num(pick(it, ['shareCount','shares','reshareCount'])),
      views: num(pick(it, ['playCount','videoViewCount','views','viewCount'])),
      posted_at: pick(it, ['createTimeISO','timestamp','publishedAt','postedAtISO','date'])
    }};
  }
  if (target === 'candidates') {
    const first = pick(it, ['firstName']); const last = pick(it, ['lastName']);
    const name = pick(it, ['fullName','name']) || [first, last].filter(Boolean).join(' ') || null;
    const url = pick(it, ['profileUrl','url','linkedinUrl','publicProfileUrl']);
    return { _key: url || name, row: {
      name: name || 'Unknown',
      role: pick(it, ['headline','title','occupation','jobTitle','position']),
      region: pick(it, ['location','locationName','geoRegion','addressWithCountry']),
      stage: 'new',
      notes: url || null
    }};
  }
  if (target === 'ads') {
    const url = pick(it, ['url','adUrl','link','snapshotUrl','adSnapshotUrl']);
    return { _key: url, row: {
      advertiser: pick(it, ['advertiserName','pageName','advertiser','page_name','pageNme']),
      platform: source || pick(it, ['platform']),
      ad_text: pick(it, ['text','adText','body','snippet','description']) || (it.creatives && it.creatives[0] && it.creatives[0].body) || null,
      ad_url: url,
      started_on: pick(it, ['startDate','startedRunning','firstShown','startDateFormatted'])
    }};
  }
  return null;
}

const TARGET_TABLE = { content: 'content_ideas', media: 'os_social_posts', candidates: 'os_candidates', ads: 'os_competitor_ads' };
const DEDUPE_COL   = { content: 'post_url', media: 'url', candidates: 'notes', ads: 'ad_url' };

async function fetchDataset(datasetId) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not configured');
  const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&limit=1000&token=${token}`);
  if (!r.ok) throw new Error(`Apify dataset fetch ${r.status}`);
  return r.json();
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const isAdmin = !!verifyToken(req);
  const secret = req.headers['x-apify-secret'];
  const isApify = secret && secret === process.env.APIFY_INGEST_SECRET;
  if (!isAdmin && !isApify) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body || {};
  const target = (req.query.target || body.target || '').toLowerCase();
  const source = (req.query.source || body.source || '').toLowerCase() || null;
  if (!TARGET_TABLE[target]) return res.status(400).json({ error: 'target must be content|media|candidates|ads' });

  let items = Array.isArray(body.items) ? body.items : null;
  if (!items) {
    const datasetId = body.datasetId || body.resource?.defaultDatasetId;
    if (!datasetId) return res.status(400).json({ error: 'provide items[] or a datasetId / Apify webhook payload' });
    try { items = await fetchDataset(datasetId); }
    catch (e) { return res.status(502).json({ error: e.message }); }
  }
  if (!items.length) return res.json({ ok: true, inserted: 0, skipped: 0 });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const table = TARGET_TABLE[target];
  const dedupeCol = DEDUPE_COL[target];

  const mapped = items.map(it => mapItem(target, source, it)).filter(m => m && m.row);
  // Dedupe against existing rows by the natural key (in this batch's key set)
  const keys = [...new Set(mapped.map(m => m._key).filter(Boolean))];
  let existing = new Set();
  if (keys.length) {
    const { data } = await db.from(table).select(dedupeCol).in(dedupeCol, keys);
    existing = new Set((data || []).map(r => r[dedupeCol]));
  }
  const seen = new Set();
  const rows = [];
  for (const m of mapped) {
    if (m._key && (existing.has(m._key) || seen.has(m._key))) continue;
    if (m._key) seen.add(m._key);
    rows.push(m.row);
  }
  if (!rows.length) return res.json({ ok: true, inserted: 0, skipped: mapped.length });

  const { error } = await db.from(table).insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ ok: true, inserted: rows.length, skipped: mapped.length - rows.length, target });
};

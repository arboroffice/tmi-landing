const { requireAuth, cors } = require('./_auth');

// SEO Command Center - pulls a live snapshot from the Ahrefs API v3 REST for
// tmi-technology.com. Monetary values from Ahrefs are returned in USD cents.
const AHREFS_BASE = 'https://api.ahrefs.com/v3';
const TARGET = 'tmi-technology.com';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Best-effort GET against an Ahrefs endpoint. Never throws - on any failure it
// returns { error } so a single bad call cannot 500 the whole snapshot.
async function ahrefs(path, params, key) {
  const qs = new URLSearchParams(params).toString();
  const url = `${AHREFS_BASE}/${path}${qs ? '?' + qs : ''}`;
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    const text = await r.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) {
      return { error: { status: r.status, body } };
    }
    return { data: body };
  } catch (e) {
    return { error: { status: 0, body: e.message } };
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.AHREFS_API_KEY;
  if (!key) {
    return res.status(200).json({ needs_key: true, key: 'AHREFS_API_KEY' });
  }

  const date = today();
  const out = { target: TARGET, date, errors: {} };

  // 1. Domain Rating - site-explorer/domain-rating
  const drRes = await ahrefs('site-explorer/domain-rating', {
    target: TARGET,
    date,
    protocol: 'both',
  }, key);
  if (drRes.error) {
    out.domain_rating = null;
    out.errors.domain_rating = drRes.error;
  } else {
    const d = drRes.data || {};
    // Ahrefs returns either { domain_rating: { domain_rating, ahrefs_rank } } or flat.
    const dr = d.domain_rating || d;
    out.domain_rating = typeof dr.domain_rating === 'number' ? dr.domain_rating : (dr.domain_rating ?? null);
    out.ahrefs_rank = dr.ahrefs_rank ?? null;
  }

  // 2. Top organic keywords - site-explorer/organic-keywords, ordered by volume.
  const kwRes = await ahrefs('site-explorer/organic-keywords', {
    target: TARGET,
    date,
    country: 'us',
    mode: 'subdomains',
    select: 'keyword,volume,best_position,best_position_url,sum_traffic,keyword_difficulty,cpc',
    order_by: 'volume:desc',
    limit: '25',
  }, key);
  if (kwRes.error) {
    out.keywords = [];
    out.errors.keywords = kwRes.error;
  } else {
    const rows = (kwRes.data && (kwRes.data.keywords || kwRes.data.organic_keywords)) || [];
    out.keywords = rows.map(k => ({
      keyword: k.keyword,
      volume: k.volume ?? null,
      position: k.best_position ?? k.position ?? null,
      url: k.best_position_url ?? k.url ?? null,
      traffic: k.sum_traffic ?? k.traffic ?? null,
      difficulty: k.keyword_difficulty ?? null,
      // Ahrefs CPC is in USD cents - expose dollars for the UI.
      cpc: typeof k.cpc === 'number' ? k.cpc / 100 : null,
    }));
  }

  // 3. Top pages by traffic - site-explorer/top-pages.
  const pgRes = await ahrefs('site-explorer/top-pages', {
    target: TARGET,
    date,
    country: 'us',
    mode: 'subdomains',
    select: 'url,sum_traffic,sum_traffic_top_keyword,top_keyword,top_keyword_volume,value',
    order_by: 'sum_traffic:desc',
    limit: '25',
  }, key);
  if (pgRes.error) {
    out.pages = [];
    out.errors.pages = pgRes.error;
  } else {
    const rows = (pgRes.data && (pgRes.data.pages || pgRes.data.top_pages)) || [];
    out.pages = rows.map(p => ({
      url: p.url,
      traffic: p.sum_traffic ?? p.traffic ?? null,
      top_keyword: p.top_keyword ?? null,
      top_keyword_volume: p.top_keyword_volume ?? null,
      // traffic value is in USD cents - expose dollars.
      value: typeof p.value === 'number' ? p.value / 100 : null,
    }));
  }

  return res.status(200).json(out);
};

// Brave Search API - the "other sites" engine for the audit research pass.
// One key, searches the whole web (their Google Business Profile, Yelp, BBB,
// LinkedIn, news, directories) and returns titles + snippets + URLs. We feed the
// snippets to Claude, which extracts review counts, headcount bands, categories,
// founded year, and notable mentions - the things Apollo/Apify used to fetch, plus
// everything those two never saw. Best-effort: returns null/[] with no key.
// Env: BRAVE_API_KEY  (https://brave.com/search/api/)

const BASE = 'https://api.search.brave.com/res/v1/web/search';

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export async function braveSearch(query, { count = 5 } = {}) {
  const key = process.env.BRAVE_API_KEY;
  if (!key || !query) return [];
  try {
    const url = `${BASE}?q=${encodeURIComponent(query)}&count=${count}&result_filter=web`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const web = (data.web && data.web.results) || [];
    return web.map((r) => ({
      title: stripTags(r.title),
      url: r.url || null,
      description: stripTags(r.description),
      source: (r.profile && r.profile.name) || (r.meta_url && r.meta_url.hostname) || null,
      age: r.age || null,
    }));
  } catch {
    return [];
  }
}

// Run a small, targeted set of queries about ONE company and aggregate the
// results. Sequential to respect Brave's free-tier 1 req/sec limit.
export async function webResearch({ company, location, website } = {}) {
  if (!process.env.BRAVE_API_KEY || !company) return null;
  const loc = location ? ` ${location}` : '';
  const queries = [
    `${company}${loc} reviews`,
    `${company} company linkedin employees`,
    `${company}${loc}`,
  ];

  const seen = new Set();
  const results = [];
  for (const q of queries) {
    const rs = await braveSearch(q, { count: 5 });
    for (const r of rs) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      results.push(r);
    }
  }
  if (!results.length) return null;
  return { queries, results: results.slice(0, 15) };
}

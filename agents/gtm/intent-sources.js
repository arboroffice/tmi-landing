// Source adapters for the intent agent. Each returns a flat list of normalized
// candidate items and degrades to [] (never throws) when its token/actor is not
// configured, so a run still works with only the sources you have set up.
//
// Normalized candidate:
//   { source, sourceId, url, text, company, person:{name,title,profileUrl}, location, typeHint }

const APIFY = 'https://api.apify.com/v2';

async function runActor(actorId, input, timeoutSecs = 120) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];
  const url = `${APIFY}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSecs}&memory=512`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${actorId} ${res.status}`);
  return res.json();
}

const clip = (s, n = 600) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// ── Job postings (hiring intent) ───────────────────────────────────────────
export async function fetchJobSignals(queries, perQuery = 12) {
  const out = [];
  for (const q of queries) {
    try {
      const items = await runActor('misceres~indeed-scraper', {
        position: q, country: 'us', maxItems: perQuery, saveOnlyUniqueItems: true,
      });
      for (const j of items || []) {
        if (!j.company) continue;
        out.push({
          source: 'indeed',
          sourceId: `indeed:${j.id || j.url}`,
          url: j.url || null,
          text: clip(`${j.positionName} at ${j.company}. ${j.description || ''}`),
          company: j.company,
          person: null,
          location: j.location || null,
          typeHint: 'hiring',
        });
      }
    } catch (e) { console.warn(`job source "${q}": ${e.message}`); }
  }
  return out;
}

// ── LinkedIn posts/comments (buying intent) ────────────────────────────────
// Set APIFY_LINKEDIN_POSTS_ACTOR to a post-search actor id to enable. Mapping is
// defensive because actor output shapes vary.
export async function fetchLinkedInSignals(queries, perQuery = 10) {
  const actor = process.env.APIFY_LINKEDIN_POSTS_ACTOR;
  if (!actor || !process.env.APIFY_API_TOKEN) return [];
  const out = [];
  for (const q of queries) {
    try {
      const items = await runActor(actor, { keywords: q, searchQuery: q, maxItems: perQuery, limit: perQuery }, 180);
      for (const p of items || []) {
        const text = p.text || p.content || p.postText || p.commentText || '';
        if (!text) continue;
        out.push({
          source: 'linkedin',
          sourceId: `linkedin:${p.urn || p.postUrl || p.url || text.slice(0, 40)}`,
          url: p.postUrl || p.url || p.profileUrl || null,
          text: clip(text),
          company: p.companyName || p.authorCompany || null,
          person: {
            name: p.authorName || p.author || p.fullName || null,
            title: p.authorHeadline || p.headline || p.authorTitle || null,
            profileUrl: p.authorProfileUrl || p.profileUrl || p.authorUrl || null,
          },
          location: p.location || null,
          typeHint: 'buying',
        });
      }
    } catch (e) { console.warn(`linkedin source "${q}": ${e.message}`); }
  }
  return out;
}

// ── Reddit (buying intent / shopping chatter) ──────────────────────────────
export async function fetchRedditSignals(subreddits, perSub = 10) {
  if (!process.env.APIFY_API_TOKEN) return [];
  const out = [];
  for (const sub of subreddits) {
    try {
      const items = await runActor('trudax~reddit-scraper-lite', {
        startUrls: [{ url: `https://www.reddit.com/r/${sub}/search/?q=software%20OR%20AI%20OR%20automate&restrict_sr=1&sort=new` }],
        maxItems: perSub, maxPostCount: perSub, skipComments: false,
      }, 180);
      for (const r of items || []) {
        const text = r.title ? `${r.title}. ${r.body || r.text || ''}` : (r.body || r.text || '');
        if (!text || text.length < 30) continue;
        out.push({
          source: 'reddit',
          sourceId: `reddit:${r.id || r.url}`,
          url: r.url || null,
          text: clip(text),
          company: null,
          person: { name: r.username || r.author || null, title: null, profileUrl: null },
          location: null,
          typeHint: 'buying',
        });
      }
    } catch (e) { console.warn(`reddit source "${sub}": ${e.message}`); }
  }
  return out;
}

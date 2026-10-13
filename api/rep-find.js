// Find people near me: industrial businesses (and who runs them) around any
// point, pulled from Google Maps through Apify. A search takes a minute or two,
// so it runs in the background: POST starts it, GET checks on it. Results are
// kept for 14 days per area, so a second rep searching the same spot is free.
//
//   GET  ?ready=1                         -> { apify: true|false }
//   POST { lat, lng, radius, kind, label } -> { key, status, results? }
//   GET  ?key=<key>                       -> { key, status, results?, error? }
const crypto = require('crypto');
const db = require('./_db');
const { cors } = require('./_auth');
const { requireRep } = require('./_rep-auth');

const ACTOR = 'compass~crawler-google-places';
const KEEP_DAYS = 14;
const DAILY_SEARCHES = 8;

// Industrial only. Every kind is a set of Google Maps searches.
const KINDS = {
  all: ['machine shop', 'metal fabrication', 'oilfield services', 'industrial supply', 'heavy haul trucking', 'industrial contractor', 'equipment rental', 'manufacturer', 'welding shop', 'crane service'],
  fab: ['machine shop', 'metal fabrication', 'welding shop', 'steel fabricator'],
  oil: ['oilfield services', 'oil and gas equipment', 'pipeline contractor', 'oilfield trucking'],
  supply: ['industrial supply', 'pipe valves fittings supplier', 'industrial equipment supplier'],
  haul: ['heavy haul trucking', 'trucking company', 'crane service'],
  build: ['industrial contractor', 'industrial electrical contractor', 'mechanical contractor'],
  rental: ['equipment rental', 'heavy equipment repair'],
  mfg: ['manufacturer', 'manufacturing plant', 'chemical plant'],
  repair: ['industrial repair', 'pump repair', 'motor repair', 'hydraulic repair'],
};

// Not industrial, or not a place a rep can walk in and reach the owner.
const SKIP_CAT = /(restaurant|cafe|coffee|bar\b|pub|fast food|store|shop(ping)? (mall|center)|grocery|church|school|college|university|hospital|clinic|doctor|dentist|pharmacy|bank|credit union|atm|hotel|motel|lodging|apartment|real estate|salon|barber|spa\b|gym|fitness|park\b|auto repair|car repair|auto body|tire shop|oil change|car wash|car dealer|landscap|lawn|plumber|roofing|hvac|air conditioning|pest|cleaning|insurance|attorney|lawyer|government|post office|gas station|convenience|liquor|church)/i;
const BIG = /\b(home depot|lowe'?s|walmart|grainger|fastenal|united rentals|sunbelt rentals|herc rentals|caterpillar|cat rental|holt cat|john deere|baker hughes|halliburton|schlumberger|slb\b|weatherford|nov\b|national oilwell|ups\b|fedex|ryder|penske|airgas|praxair|linde|tractor supply|harbor freight|o'?reilly|autozone|napa auto|advance auto|ferguson|motion industries|applied industrial|mcjunkin|mrc global|dnow|wesco|graybar|rexel|cintas|unifirst|waste management|republic services|enterprise rent|u-haul|eastman|trinity|valero|exxon|chevron|shell\b|marathon)\b/i;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const today = () => new Date().toISOString().slice(0, 10);

function areaKey(lat, lng, radius, kind) {
  // About a 3 mile grid, so nearby searches share results.
  return crypto.createHash('sha1').update([lat.toFixed(2), lng.toFixed(2), radius, kind].join('|')).digest('hex').slice(0, 24);
}

async function apify(path, opts) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('not_linked');
  const r = await fetch(`https://api.apify.com/v2/${path}${path.includes('?') ? '&' : '?'}token=${token}`, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
  if (!r.ok) throw new Error('apify ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
  return r.json();
}

function person(p) {
  const name = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || null;
  if (!name) return null;
  return {
    name, title: p.jobTitle || p.title || p.headline || null,
    email: p.email || null, phone: p.mobileNumber || p.phone || p.phoneNumber || null,
    linkedin: p.linkedinProfile || p.linkedinUrl || p.linkedin || null,
  };
}

function mapPlace(it, center) {
  if (!it || !it.title || it.permanentlyClosed || it.temporarilyClosed) return null;
  const cats = [it.categoryName].concat(it.categories || []).filter(Boolean).join(' | ');
  if (SKIP_CAT.test(cats + ' ' + it.title) || BIG.test(it.title)) return null;
  const loc = it.location || {};
  const lat = num(loc.lat), lng = num(loc.lng);
  const people = (Array.isArray(it.leadsEnrichment) ? it.leadsEnrichment : []).map(person).filter(Boolean).slice(0, 3);
  let miles = null;
  if (lat != null && lng != null) {
    const R = 3958.8, rad = (d) => d * Math.PI / 180;
    const a = Math.sin(rad(lat - center.lat) / 2) ** 2 + Math.cos(rad(center.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - center.lng) / 2) ** 2;
    miles = Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
  }
  return {
    name: it.title, category: it.categoryName || null, address: it.address || null, city: it.city || null, state: it.state || null,
    phone: it.phone || null, website: it.website || null, lat, lng, miles,
    rating: num(it.totalScore), reviews: num(it.reviewsCount), place_id: it.placeId || null, maps: it.url || null, people,
  };
}

async function finish(key, doc) {
  const run = await apify(`actor-runs/${doc.run_id}`);
  const st = run.data && run.data.status;
  if (st === 'RUNNING' || st === 'READY') return Object.assign({}, doc, { status: 'running' });
  if (st !== 'SUCCEEDED' && st !== 'TIMED-OUT') {
    await db.update('rep_finds', key, { status: 'failed', error: st || 'unknown' });
    return Object.assign({}, doc, { status: 'failed', error: st });
  }
  const items = await apify(`datasets/${run.data.defaultDatasetId}/items?clean=true&limit=1000`);
  const seen = new Set();
  const results = (items || []).map((it) => mapPlace(it, doc.center)).filter((p) => {
    if (!p) return false;
    const k = p.place_id || (p.name + '|' + p.address).toLowerCase();
    if (seen.has(k)) return false; seen.add(k);
    return p.miles == null || p.miles <= doc.radius + 1;
  }).sort((a, z) => (z.people.length > 0) - (a.people.length > 0) || (a.miles || 99) - (z.miles || 99)).slice(0, 400);
  const up = { status: 'done', results, done_at: new Date().toISOString() };
  await db.update('rep_finds', key, up);
  return Object.assign({}, doc, up);
}

const out = (key, d) => ({ key, status: d.status, label: d.label || null, radius: d.radius, kind: d.kind, results: d.status === 'done' ? d.results : undefined, error: d.error || undefined, started_at: d.started_at });

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && req.query.ready) return res.json({ apify: !!process.env.APIFY_TOKEN });
  const rep = await requireRep(req, res); if (!rep) return;
  if (!(await require('./rep-onboarding').cleared(rep.sub))) return res.status(403).json({ error: 'Finish your paperwork to unlock your leads', paperwork: true });
  try {
    if (req.method === 'GET') {
      const key = String(req.query.key || '');
      const doc = key && await db.getById('rep_finds', key).catch(() => null);
      if (!doc) return res.status(404).json({ error: 'Search not found' });
      if (doc.status !== 'running') return res.json(out(key, doc));
      return res.json(out(key, await finish(key, doc)));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

    const b = req.body || {};
    const lat = num(b.lat), lng = num(b.lng);
    if (lat == null || lng == null) return res.status(400).json({ error: 'Pick a place first' });
    const radius = [5, 10, 25, 50].includes(Number(b.radius)) ? Number(b.radius) : 10;
    const kind = KINDS[b.kind] ? b.kind : 'all';
    const key = areaKey(lat, lng, radius, kind);

    const have = await db.getById('rep_finds', key).catch(() => null);
    const fresh = have && have.started_at && (Date.now() - new Date(have.started_at).getTime()) < KEEP_DAYS * 864e5;
    if (fresh && have.status !== 'failed') return res.json(out(key, have.status === 'running' ? await finish(key, have) : have));

    // Each new search costs a little, so cap it per rep per day.
    const useId = rep.sub + '_' + today();
    const use = await db.getById('rep_find_usage', useId).catch(() => null);
    if (use && use.count >= DAILY_SEARCHES) return res.status(429).json({ error: `That is ${DAILY_SEARCHES} new searches today. Areas you already searched still work.` });

    const terms = KINDS[kind];
    const input = {
      searchStringsArray: terms,
      customGeolocation: { type: 'Point', coordinates: [lng, lat], radiusKm: Math.round(radius * 1.609 * 10) / 10 },
      maxCrawledPlacesPerSearch: kind === 'all' ? 25 : 40,
      language: 'en', countryCode: 'us',
      skipClosedPlaces: false, scrapePlaceDetailPage: false,
      // Who runs it: up to 2 leaders per business that has a website.
      maximumLeadsEnrichmentRecords: 2,
      leadsEnrichmentDepartments: ['c_suite', 'operations'],
    };
    const run = await apify(`acts/${ACTOR}/runs?timeout=600&memory=2048`, { method: 'POST', body: JSON.stringify(input) });
    const doc = {
      status: 'running', run_id: run.data.id, center: { lat, lng }, radius, kind, label: String(b.label || '').slice(0, 120) || null,
      started_at: new Date().toISOString(), started_by: rep.sub,
    };
    await db.update('rep_finds', key, doc);
    await db.update('rep_find_usage', useId, { rep_id: rep.sub, date: today(), count: ((use && use.count) || 0) + 1 });
    return res.json(out(key, doc));
  } catch (e) {
    if (e.message === 'not_linked') return res.status(503).json({ error: 'not_linked' });
    console.error('rep-find:', e.message);
    return res.status(502).json({ error: 'Search did not start. Try again in a minute.' });
  }
};

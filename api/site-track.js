// First-party analytics for the public website (tmitechai.com). The site's
// analytics.js beacons every page view and every tracked event here, so admin
// can see traffic without a third-party analytics account.
//   POST (sendBeacon, text/plain JSON) { name, path, ref, vid, sid, utm..., first_*, detail }
//   GET  ?days=30 (admin) -> { totals, byDay, topPages, sources, events, recent }
const db = require('./_db');
const { verifyToken } = require('./_auth');

const ALLOWED = ['https://www.tmitechai.com', 'https://tmitechai.com'];
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|python|axios/i;
const clip = (v, n = 300) => (v == null || v === '' ? null : String(v).slice(0, n));

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin) || /^https:\/\/tmitechaiwebsite-[a-z0-9-]+\.vercel\.app$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    if (BOT.test(req.headers['user-agent'] || '')) return res.status(204).end();
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    const name = clip(b.name, 60);
    if (!name) return res.status(204).end();
    const ua = String(req.headers['user-agent'] || '');
    const detail = {};
    Object.keys(b.detail || {}).slice(0, 12).forEach((k) => { detail[k] = clip(b.detail[k], 200); });
    try {
      await db.insert('site_events', {
        name, path: clip(b.path, 200), ref: clip(b.ref), vid: clip(b.vid, 40), sid: clip(b.sid, 40),
        utm_source: clip(b.utm_source, 80), utm_medium: clip(b.utm_medium, 80), utm_campaign: clip(b.utm_campaign, 120),
        first_source: clip(b.first_source, 120), first_landing_page: clip(b.first_landing_page, 200),
        device: /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop',
        country: clip(req.headers['x-vercel-ip-country'], 4), region: clip(req.headers['x-vercel-ip-country-region'], 8),
        city: clip(decodeURIComponent(req.headers['x-vercel-ip-city'] || ''), 60),
        detail, created_at: new Date().toISOString(),
      });
    } catch (e) { console.error('site-track:', e.message); }
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const rows = await db.list('site_events', { where: [['created_at', '>=', since]], limit: 50000 }).catch(() => []);
    const views = rows.filter((r) => r.name === 'pageview');
    const visitors = new Set(views.map((r) => r.vid).filter(Boolean));
    const count = (list, key) => { const m = {}; list.forEach((r) => { const k = key(r); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const sourceOf = (r) => r.utm_source || r.first_source || (r.ref && !/tmitechai\.com/.test(r.ref) ? r.ref.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'direct');
    const byDay = {}; views.forEach((r) => { const d = String(r.created_at).slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    return res.json({
      days,
      totals: {
        views: views.length, visitors: visitors.size,
        form_starts: rows.filter((r) => r.name === 'lead_form_started').length,
        form_submits: rows.filter((r) => r.name === 'lead_form_success').length,
        cta_clicks: rows.filter((r) => /click|cta/.test(r.name)).length,
      },
      byDay: Object.entries(byDay).sort(),
      topPages: count(views, (r) => r.path).slice(0, 15),
      sources: count(views, sourceOf).slice(0, 12),
      events: count(rows.filter((r) => r.name !== 'pageview'), (r) => r.name).slice(0, 15),
      devices: count(views, (r) => r.device),
      places: count(views, (r) => [r.city, r.region].filter(Boolean).join(', ')).slice(0, 10),
    });
  }
  return res.status(405).end();
};

module.exports.config = { maxDuration: 30 };

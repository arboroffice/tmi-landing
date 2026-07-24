const jwt = require('jsonwebtoken');
const db = require('./_db');
const { verifyToken, cors } = require('./_auth');
const { scoreVisitor } = require('./_visitor-score');
const { getAutomationSettings } = require('./_visitor-settings');

// Visitor automation brain.
//
// Decides, per identified visitor, whether to (1) enrich via Apollo and
// (2) start outbound (enroll into the email-only nurture + Meta audience) —
// gated entirely by the admin settings (os_kv 'visitor_automation'). It does
// the work by calling the existing, tested /api/visitor-enrich and
// /api/visitor-enroll endpoints with a short-lived internal service token, so
// the manual review flow stays untouched.
//
// Invoked:
//   - by api/rb2b-webhook (via QStash) ~45s after a qualifying visitor lands
//   - by the admin "Run automation now" button (admin JWT) — { all:true }
// Auth: ?secret=CRON_SECRET / x-internal-secret header (the webhook + QStash
// path), or an admin JWT (manual). Body: { id } | { ids:[...] } | { all:true }.

const SITE = 'https://www.tmitechai.com';
const OWN_DOMAINS = ['tmitechai.com', 'tmi-technology.com', 'arboroffice.io'];

// Pipeline statuses that mean a human / prior step already owns this person, so
// automated cold outreach must not step on them.
const ACTIVE_LEAD_STATUSES = [
  'contacted', 'qualified', 'proposal', 'booked', 'won', 'lost',
  'client', 'building', 'customer', 'onboarding', 'closed', 'paid',
  'unsubscribed', 'do_not_contact', 'rejected',
];

function domainOf(email) {
  return email && email.includes('@') ? email.split('@')[1].toLowerCase() : '';
}

function serviceToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ svc: 'visitor-process' }, secret, { expiresIn: '5m' });
}

async function callInternal(path, token, body) {
  try {
    const r = await fetch(`${SITE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Should auto-outbound be suppressed for this email? (Own team, existing client,
// or a lead a human is already working / who opted out.)
async function outboundSuppressed(db, email) {
  if (!email) return 'no email';
  if (OWN_DOMAINS.includes(domainOf(email))) return 'own domain';
  try {
    const cl = await db.findOne('clients', 'email', email);
    if (cl) return 'existing client';
  } catch { /* clients collection optional */ }
  try {
    const lead = await db.findOne('leads', 'email', email);
    if (lead && ACTIVE_LEAD_STATUSES.includes(lead.status)) return `lead status ${lead.status}`;
  } catch { /* best effort */ }
  return null;
}

async function processOne(db, settings, id, token) {
  let v = await db.getById('site_visitors', id);
  if (!v) return { id, skipped: 'not found' };
  if (v.enrolled) return { id, skipped: 'already enrolled' };

  const out = { id, name: [v.first_name, v.last_name].filter(Boolean).join(' ') || v.company || '(unknown)' };
  const email = v.email || v.personal_email;
  const ownDomain = OWN_DOMAINS.includes(domainOf(email));

  // 1. ENRICH — if enabled, at/above the bar, not already enriched, not our team,
  //    and Apollo is wired. visitor-enrich backfills industry/title/size which can
  //    raise the score below.
  if (settings.auto_enrich && !v.enrichment && (v.score || 0) >= settings.enrich_min_score
      && !ownDomain && process.env.APOLLO_API_KEY) {
    const r = await callInternal('/api/visitor-enrich', token, { id });
    out.enriched = !!(r.ok && r.json && r.json.ok);
    if (!out.enriched) out.enrich_error = (r.json && r.json.error) || r.error || r.status;
    const re = await db.getById('site_visitors', id);
    if (re) v = re;
  }

  // 2. RE-SCORE — post-enrich data may push the visitor over the outbound bar.
  const { score, reasons } = scoreVisitor(v);
  if (score !== v.score) {
    await db.update('site_visitors', id, { score, score_reasons: reasons });
    v.score = score;
  }
  out.score = v.score;

  // 3. OUTBOUND — if enabled, at/above the ICP bar, with the right kind of email,
  //    and not suppressed. visitor-enroll re-checks own-domain + unsubscribed and
  //    does the contact/lead/nurture/Meta work.
  if (settings.auto_outbound) {
    const emailOk = settings.require_work_email ? !!v.email : !!email;
    if (!emailOk) {
      out.outbound = 'skipped: no work email';
    } else if ((v.score || 0) < settings.outbound_min_score) {
      out.outbound = `skipped: below ICP bar (${v.score} < ${settings.outbound_min_score})`;
    } else {
      const sup = await outboundSuppressed(db, v.email || email);
      if (sup) {
        out.outbound = `skipped: ${sup}`;
      } else {
        const r = await callInternal('/api/visitor-enroll', token, { id });
        const enrolledOk = !!(r.ok && r.json && r.json.enrolled);
        out.outbound = enrolledOk ? 'enrolled' : 'enroll failed';
        if (!enrolledOk) out.enroll_detail = (r.json && (r.json.results || r.json.error)) || r.error || r.status;
        else out.auto = true;
      }
    }
  }

  return out;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const isCron = !!req.headers['x-vercel-cron'];
  if (req.method !== 'POST' && !isCron) return res.status(405).json({ error: 'Method not allowed' });

  // Auth: Vercel Cron (daily backfill sweep), internal secret (webhook/QStash),
  // or admin JWT (manual run).
  const internal = process.env.CRON_SECRET;
  const supplied = req.headers['x-internal-secret'] || req.query.secret;
  const isAdmin = !!verifyToken(req);
  if (!isCron && !isAdmin && !(internal && supplied === internal)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const settings = await getAutomationSettings();
  if (!settings.enabled) return res.json({ ok: true, skipped: 'automation disabled' });

  const body = (req.method === 'POST' && req.body) ? req.body : {};
  let ids = [];
  if (body.all || isCron) {
    // Backfill: every not-yet-enrolled visitor at/above the lower (enrich) bar.
    const bar = Math.min(settings.enrich_min_score, settings.outbound_min_score);
    // 'enrolled' equality + 'score' range + orderBy(score) needs a single
    // inequality field, which Firestore allows. Filter enrolled in JS to avoid
    // a composite index requirement on (enrolled, score).
    const rows = await db.list('site_visitors', { where: [['score', '>=', bar]], order: 'score', ascending: false, limit: 200 });
    ids = rows.filter(r => r.enrolled === false || r.enrolled == null).map(r => r.id);
  } else {
    ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  }
  if (!ids.length) return res.json({ ok: true, processed: 0, results: [] });

  const token = serviceToken();
  const results = [];
  for (const id of ids) {
    try { results.push(await processOne(db, settings, id, token)); }
    catch (e) { results.push({ id, error: e.message }); }
  }

  return res.json({
    ok: true,
    processed: results.length,
    enrolled: results.filter(r => r.outbound === 'enrolled').length,
    enriched: results.filter(r => r.enriched).length,
    results,
  });
};

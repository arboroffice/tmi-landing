// Form submissions from the public website (tmitechai.com) land here, so they
// show up in admin instead of only in Mia's inbox. The website still sends its
// email through FormSubmit too; this is the copy that feeds the database.
//
//   POST { crm_tag, name, email, phone, company, ...fields, utm/attribution }
//
// owner_audit / embedded_partner / exit_readiness / fotf_application -> applications
//   (Inbox > Applications). venture_studio -> venture_applications (Venture Studio).
// Every submission is also kept raw in site_submissions.
const db = require('./_db');

const ALLOWED = ['https://www.tmitechai.com', 'https://tmitechai.com'];
const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const AUDIENCE = { owner_audit: 'owner', embedded_partner: 'embedded_partner', exit_readiness: 'exit_readiness', fotf_application: 'founder' };
const LABEL = { owner_audit: 'Audit / Fit Call', embedded_partner: 'Embedded Partner', exit_readiness: 'Exit Readiness', fotf_application: 'Founders of the Future', venture_studio: 'Venture Studio' };

const clip = (v, n = 2000) => (v == null ? null : String(v).trim().slice(0, n) || null);

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin) || /^https:\/\/tmitechaiwebsite-[a-z0-9-]+\.vercel\.app$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Admin: the latest website submissions, for the dashboard.
  if (req.method === 'GET') {
    const { verifyToken } = require('./_auth');
    if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    const rows = await db.list('site_submissions', { order: 'created_at', ascending: false, limit: 25 }).catch(() => []);
    return res.json((rows || []).map((r) => ({ id: r.id, intent: r.intent, label: LABEL[r.intent] || r.intent, name: r.name, email: r.email, phone: r.phone, company: r.company, message: r.message, source: (r.attribution && (r.attribution.utm_source || r.attribution.first_source || r.attribution.first_referrer)) || null, created_at: r.created_at })));
  }
  if (req.method !== 'POST') return res.status(405).end();

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  // Bot traps: FormSubmit-style honeypots must stay empty.
  if (b._honey || b._gotcha) return res.status(200).json({ ok: true });

  const intent = clip(b.crm_tag, 60) || 'website_inquiry';
  const email = (clip(b.email, 200) || '').toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email required' });
  const name = clip(b.name, 200);
  const phone = clip(b.phone, 40);
  const company = clip(b.company, 200);
  const message = clip(b.desired_outcome || b.goal || b.building || b.problem || b.message);
  const now = new Date().toISOString();
  const attribution = {};
  ['page_url', 'page_path', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'first_source', 'first_medium', 'first_campaign', 'first_referrer', 'first_landing_page', 'first_seen_at']
    .forEach((k) => { if (b[k]) attribution[k] = clip(b[k], 500); });
  const fields = {};
  Object.keys(b).forEach((k) => { if (!k.startsWith('_') && !(k in attribution) && k !== 'crm_tag') fields[k] = clip(b[k]); });

  try {
    await db.insert('site_submissions', { intent, name, email, phone, company, message, fields, attribution, site: 'tmitechai.com', created_at: now });

    if (intent === 'venture_studio') {
      const [first, ...rest] = String(name || '').split(/\s+/);
      await db.insert('venture_applications', {
        first_name: first || null, last_name: rest.join(' ') || null, email, phone,
        industry: clip(b.expertise), goal: clip(b.problem), source: 'tmitechai.com', status: 'new', created_at: now,
      });
    } else {
      // One application per email. A repeat submission refreshes the details
      // but never moves an application backwards (booked/paid stay as they are).
      const existing = await db.findOne('applications', 'email', email).catch(() => null);
      const patch = {
        name: name || (existing && existing.name) || null, phone: phone || (existing && existing.phone) || null,
        company: company || (existing && existing.company) || null, message: message || (existing && existing.message) || null,
        audience: AUDIENCE[intent] || (existing && existing.audience) || 'owner', intent,
        source: (existing && existing.source) || 'tmitechai.com', attribution, last_submitted_at: now, updated_at: now,
      };
      if (existing) await db.update('applications', existing.id, patch);
      else await db.insert('applications', Object.assign({ email, status: 'captured', captured_at: now, created_at: now }, patch));
    }

    // Team text for anything an owner sent.
    if (intent !== 'fotf_application' && process.env.TWILIO_ACCOUNT_SID) {
      require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
        body: `tmitechai.com ${LABEL[intent] || intent}: ${name || ''}${company ? ' | ' + company : ''} | ${email}${phone ? ' | ' + phone : ''}`.slice(0, 300),
        from: FROM_NUMBER, to: ALERT_NUMBER,
      }).catch(() => {});
    }
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('site-intake:', e.message);
    return res.status(500).json({ error: 'could not save' });
  }
};

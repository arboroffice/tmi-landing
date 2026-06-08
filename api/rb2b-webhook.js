const { getSupabase } = require('./_supabase');
const { verifyToken, cors } = require('./_auth');
const { scoreVisitor, HOT_THRESHOLD } = require('./_visitor-score');
const { getAutomationSettings } = require('./_visitor-settings');
const { Client: QStashClient } = require('@upstash/qstash');
const { Resend } = require('resend');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const OWNER_EMAIL = 'support@tmitechai.com';
const SITE = 'https://www.tmitechai.com';
const ADMIN_URL = 'https://admin.tmitechai.com/admin-visitors';

// Real-time internal alert (to the operator, not the visitor) when a hot
// visitor is identified. Best-effort; never throws.
async function sendHotAlert(v) {
  const name = [v.first_name, v.last_name].filter(Boolean).join(' ') || 'A visitor';
  const line = [name, v.title, v.company].filter(Boolean).join(' · ');
  try {
    if (process.env.TWILIO_ACCOUNT_SID) {
      const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await sms.messages.create({ body: `Hot site visitor (${v.score}): ${line} | ${v.last_page || ''} ${ADMIN_URL}`, from: FROM_NUMBER, to: ALERT_NUMBER });
    }
  } catch (e) { console.error('[rb2b-webhook] hot SMS:', e.message); }
  try {
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'TMI <support@tmitechai.com>', to: OWNER_EMAIL,
        subject: `Hot visitor (${v.score}): ${name}${v.company ? ' · ' + v.company : ''}`,
        html: `<p style="font-family:Arial,sans-serif">${line}<br>${v.email || ''}<br>Page: ${v.last_page || ''}<br>Score: ${v.score} (${(v.score_reasons || []).join(', ')})</p><p><a href="${ADMIN_URL}">Review in admin &rarr;</a></p>`,
      });
    }
  } catch (e) { console.error('[rb2b-webhook] hot email:', e.message); }
}

// RB2B visitor-identification webhook.
//
// RB2B resolves anonymous US site visitors to a person and POSTs the profile
// here. Configure the destination URL in the RB2B dashboard as:
//   https://www.tmi-technology.com/api/rb2b-webhook?secret=<RB2B_WEBHOOK_SECRET>
// (or send the secret in an x-rb2b-secret header). Each record is upserted into
// site_visitors, deduped on identity_key (LinkedIn URL, else lowercased email),
// bumping visit_count / last_seen on repeat visits. When an email is present we
// also upsert a contact (source 'rb2b-visitor') and link it.
//
// Auth: x-rb2b-secret header or ?secret= matching RB2B_WEBHOOK_SECRET, or an
// admin JWT (for manual testing). If RB2B_WEBHOOK_SECRET is unset, accepts all
// (so ingestion works before the secret is wired up) and logs a warning.

const pick = (o, keys) => { for (const k of keys) { if (o && o[k] != null && o[k] !== '') return o[k]; } return null; };
const clean = v => (v == null ? null : String(v).trim() || null);

function mapRecord(it) {
  const first = clean(pick(it, ['first_name', 'firstName', 'firstname', 'givenName']));
  const last  = clean(pick(it, ['last_name', 'lastName', 'lastname', 'familyName', 'surname']));
  const email = clean(pick(it, ['email', 'business_email', 'work_email', 'businessEmail', 'workEmail']));
  const personalEmail = clean(pick(it, ['personal_email', 'personalEmail']));
  const linkedin = clean(pick(it, ['linkedin_url', 'linkedinUrl', 'linkedin', 'li_profile_url', 'profileUrl']));

  const identityKey = (linkedin || (email || personalEmail || '').toLowerCase()) || null;
  if (!identityKey) return null;

  return {
    identity_key:   identityKey,
    first_name:     first,
    last_name:      last,
    email:          email ? email.toLowerCase() : null,
    personal_email: personalEmail ? personalEmail.toLowerCase() : null,
    linkedin_url:   linkedin,
    title:          clean(pick(it, ['title', 'job_title', 'jobTitle', 'headline', 'role', 'position'])),
    company:        clean(pick(it, ['company_name', 'company', 'companyName', 'organization', 'org_name'])),
    company_domain: clean(pick(it, ['company_domain', 'companyDomain', 'domain', 'website', 'company_website'])),
    industry:       clean(pick(it, ['industry', 'company_industry', 'companyIndustry'])),
    company_size:   clean(pick(it, ['company_size', 'companySize', 'company_employee_count', 'employee_count', 'employees', 'size'])),
    city:           clean(pick(it, ['city', 'company_city'])),
    region:         clean(pick(it, ['state', 'region', 'company_state', 'company_region'])),
    country:        clean(pick(it, ['country', 'company_country'])),
    last_page:      clean(pick(it, ['website_page', 'page', 'url', 'page_url', 'pageUrl', 'visited_url', 'landing_page'])),
    referrer:       clean(pick(it, ['referrer', 'referer', 'utm_source', 'source_url'])),
    raw:            it,
  };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.RB2B_WEBHOOK_SECRET;
  if (secret) {
    const supplied = req.headers['x-rb2b-secret'] || req.query.secret;
    const isAdmin = !!verifyToken(req);
    if (supplied !== secret && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  } else {
    console.warn('[rb2b-webhook] RB2B_WEBHOOK_SECRET not set — accepting unauthenticated payloads');
  }

  // RB2B may post a single object, an array, or { records: [...] } / { data: [...] }.
  const body = req.body || {};
  let items = Array.isArray(body) ? body
    : Array.isArray(body.records) ? body.records
    : Array.isArray(body.data) ? body.data
    : Array.isArray(body.items) ? body.items
    : [body];
  items = items.filter(it => it && typeof it === 'object');
  if (!items.length) return res.json({ ok: true, upserted: 0, skipped: 0 });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const mapped = items.map(mapRecord).filter(Boolean);
  if (!mapped.length) return res.json({ ok: true, upserted: 0, skipped: items.length });

  const now = new Date().toISOString();
  let upserted = 0;

  // Automation: hand qualifying visitors to api/visitor-process (enrich -> re-score
  // -> auto-outbound), governed by the admin settings. The webhook only stores +
  // enqueues so it stays fast; visitor-process does the slow/charged work and is
  // idempotent. Needs QSTASH_TOKEN (to queue) and CRON_SECRET (to auth the job).
  const automation = await getAutomationSettings(db);
  const qstash = process.env.QSTASH_TOKEN ? new QStashClient({ token: process.env.QSTASH_TOKEN }) : null;
  const autoBars = [];
  if (automation.auto_enrich) autoBars.push(automation.enrich_min_score);
  if (automation.auto_outbound) autoBars.push(automation.outbound_min_score);
  const autoBar = autoBars.length ? Math.min(...autoBars) : Infinity;
  const canAutomate = automation.enabled && qstash && !!process.env.CRON_SECRET && autoBar !== Infinity;

  for (const row of mapped) {
    try {
      const existingV = await db.from('site_visitors')
        .select('id, visit_count, alerted, score, enrolled').eq('identity_key', row.identity_key).maybeSingle();

      const visit_count = existingV.data ? (existingV.data.visit_count || 1) + 1 : 1;
      const { score, reasons } = scoreVisitor({ ...row, visit_count });
      const record = { ...row, visit_count, score, score_reasons: reasons, last_seen: now };

      const isNew = !existingV.data;
      const prevScore = existingV.data ? (existingV.data.score || 0) : -1;
      const wasEnrolled = existingV.data ? !!existingV.data.enrolled : false;

      let vid;
      if (existingV.data) {
        vid = existingV.data.id;
        await db.from('site_visitors').update(record).eq('id', vid);
      } else {
        const ins = await db.from('site_visitors').insert({ ...record, first_seen: now }).select('id').single();
        vid = ins.data ? ins.data.id : null;
      }
      upserted++;

      // Fire a one-time internal alert for hot visitors.
      if (vid && score >= HOT_THRESHOLD && !(existingV.data && existingV.data.alerted)) {
        await sendHotAlert(record).catch(() => {});
        await db.from('site_visitors').update({ alerted: true }).eq('id', vid);
      }

      // Enqueue automation once a visitor crosses the bar (and again only if the
      // score rises), never for the already-enrolled. ~45s delay lets a page
      // burst settle. visitor-process re-reads settings and is idempotent.
      if (canAutomate && vid && !wasEnrolled && score >= autoBar && (isNew || prevScore < score)) {
        qstash.publishJSON({
          url: `${SITE}/api/visitor-process?secret=${encodeURIComponent(process.env.CRON_SECRET)}`,
          delay: 45,
          body: { id: vid },
        }).catch(e => console.error('[rb2b-webhook] enqueue process:', e.message));
      }
    } catch (e) {
      console.error('[rb2b-webhook] row failed:', e.message);
    }
  }

  return res.status(201).json({ ok: true, upserted, skipped: items.length - mapped.length });
};

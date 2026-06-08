const { getSupabase } = require('./_supabase');
const { verifyToken, cors } = require('./_auth');

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

  for (const row of mapped) {
    try {
      // Optionally upsert + link a contact when we have an email.
      let contactId = null;
      const contactEmail = row.email || row.personal_email;
      if (contactEmail && row.first_name) {
        const existing = await db.from('contacts').select('id').eq('email', contactEmail).maybeSingle();
        if (existing.data) {
          contactId = existing.data.id;
        } else {
          const { data: c } = await db.from('contacts').insert({
            first_name: row.first_name,
            last_name:  row.last_name,
            email:      contactEmail,
            company:    row.company,
            title:      row.title,
            niche:      row.industry,
            notes:      'Identified site visitor (RB2B)',
          }).select('id').single();
          contactId = c ? c.id : null;
        }
      }

      const existingV = await db.from('site_visitors')
        .select('id, visit_count').eq('identity_key', row.identity_key).maybeSingle();

      if (existingV.data) {
        await db.from('site_visitors').update({
          ...row,
          contact_id:  contactId || undefined,
          visit_count: (existingV.data.visit_count || 1) + 1,
          last_seen:   now,
        }).eq('id', existingV.data.id);
      } else {
        await db.from('site_visitors').insert({
          ...row,
          contact_id: contactId,
          first_seen: now,
          last_seen:  now,
        });
        // Log the first identification on the contact timeline.
        if (contactId) {
          db.from('activities').insert({
            contact_id: contactId,
            type: 'note',
            title: 'Site visit identified (RB2B)',
            body: [row.title, row.company, row.last_page].filter(Boolean).join(' · ') || null,
          }).then(() => {}).catch(() => {});
        }
      }
      upserted++;
    } catch (e) {
      console.error('[rb2b-webhook] row failed:', e.message);
    }
  }

  return res.status(201).json({ ok: true, upserted, skipped: items.length - mapped.length });
};

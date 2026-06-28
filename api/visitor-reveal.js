// Website visitor de-anonymization ingestion webhook.
//
// Vendor-agnostic: point RB2B / Vector / Clearbit Reveal / Koala (or any reveal tool)
// at  POST /api/visitor-reveal?secret=<VISITOR_REVEAL_SECRET>  and it routes identified
// company/person visits into the SDR pipeline as warm 'new' leads the orchestrator
// audits + contacts. Especially valuable on /audit/* and /solutions visits.
//
// Accepts the common payload shapes; normalizes company, domain, person, email.

const db = require('./_db');

function pick(obj, keys) { for (const k of keys) { const v = k.split('.').reduce((o, p) => (o ? o[p] : undefined), obj); if (v) return v; } return null; }
const cleanEmail = (e) => (e && /.+@.+\..+/.test(e)) ? String(e).toLowerCase().trim() : null;
function domainFrom(url, email) {
  if (email && email.includes('@')) return email.split('@')[1].toLowerCase();
  if (!url) return null;
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const secret = req.query.secret || req.headers['x-reveal-secret'];
  if (!process.env.VISITOR_REVEAL_SECRET || secret !== process.env.VISITOR_REVEAL_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const b = req.body || {};
  // unwrap common envelopes (RB2B: {data:{...}} or array; Vector/Koala: flat)
  const items = Array.isArray(b) ? b : (Array.isArray(b.data) ? b.data : [b.data || b]);
  const out = { received: items.length, routed: 0, deduped: 0, skipped: 0 };

  for (const it of items) {
    try {
      if (!it || typeof it !== 'object') { out.skipped++; continue; }
      const company = pick(it, ['company_name', 'companyName', 'company.name', 'company', 'organization', 'account.name']);
      const website = pick(it, ['company_domain', 'companyDomain', 'domain', 'website', 'company.domain', 'company.website']);
      const email = cleanEmail(pick(it, ['email', 'work_email', 'person.email', 'contact.email']));
      const name = pick(it, ['name', 'full_name', 'person.name', 'first_name']) || null;
      const title = pick(it, ['title', 'job_title', 'person.title']) || null;
      const linkedin = pick(it, ['linkedin_url', 'linkedinUrl', 'person.linkedin_url']) || null;
      const page = pick(it, ['page_url', 'pageUrl', 'url', 'landing_page']) || null;
      const location = pick(it, ['location', 'city', 'company.location']) || null;
      const domain = domainFrom(website, email);
      if (!company && !domain && !email) { out.skipped++; continue; }

      // dedupe against existing leads (by email, else by domain)
      let existing = null;
      if (email) existing = await db.findOne('leads', 'email', email).catch(() => null);
      if (!existing && domain) existing = await db.findOne('leads', 'website', `https://${domain}`).catch(() => null);
      if (existing) {
        // bump intent on a known lead
        await db.update('leads', existing.id, { last_site_visit_at: new Date().toISOString(), score: 'hot', visited_page: page || existing.visited_page || null }).catch(() => {});
        out.deduped++; continue;
      }

      // suppression guard
      if (email) {
        const sup = await db.findOne('suppression', 'email', email).catch(() => null);
        if (sup) { out.skipped++; continue; }
      }

      await db.insert('leads', {
        company_name: company || (domain ? domain.split('.')[0] : null),
        website: domain ? `https://${domain}` : null,
        owner_name: name, owner_title: title, email: email || null,
        linkedin_url: linkedin, location,
        source: 'site_visitor', status: email ? 'new' : 'needs_contact', score: 'hot',
        unsubscribed: false,
        visited_page: page,
        research_notes: `Identified site visitor${page ? ` on ${page}` : ''}. Warm inbound intent.`,
        created_at: new Date().toISOString(),
      });
      out.routed++;
    } catch (e) { console.error('visitor-reveal item:', e.message); out.skipped++; }
  }

  return res.status(200).json({ ok: true, ...out });
};

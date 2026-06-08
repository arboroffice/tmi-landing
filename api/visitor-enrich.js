const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Apollo enrichment for an identified visitor.
// POST { id }. Enriches the person + pulls the buying committee at their company,
// stores it on site_visitors.enrichment, and returns it.
// Needs APOLLO_API_KEY. Degrades gracefully if unset / on API error.

const APOLLO = 'https://api.apollo.io/api/v1';

function domainOf(v) {
  if (v.company_domain) return String(v.company_domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const e = v.email || v.personal_email;
  if (e && e.includes('@')) {
    const d = e.split('@')[1].toLowerCase();
    if (!/(gmail|yahoo|outlook|hotmail|icloud|aol|proton)\./.test(d)) return d;
  }
  return null;
}

async function apollo(path, key, body) {
  const r = await fetch(`${APOLLO}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': key },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Apollo ${path} ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const key = process.env.APOLLO_API_KEY;
  if (!key) return res.status(503).json({ error: 'APOLLO_API_KEY not set' });

  const id = req.body && req.body.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  let db;
  try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

  const { data: v, error } = await db.from('site_visitors').select('*').eq('id', id).single();
  if (error || !v) return res.status(404).json({ error: 'Visitor not found' });

  const enrichment = { fetched_at: new Date().toISOString() };
  try {
    // 1. Match the person
    const matchBody = {};
    if (v.email) matchBody.email = v.email;
    if (v.linkedin_url) matchBody.linkedin_url = v.linkedin_url;
    if (!matchBody.email && !matchBody.linkedin_url) {
      matchBody.first_name = v.first_name; matchBody.last_name = v.last_name; matchBody.organization_name = v.company;
    }
    const m = await apollo('/people/match', key, matchBody).catch(e => ({ _error: e.message }));
    const person = m && m.person ? m.person : null;
    if (person) {
      enrichment.person = {
        title: person.title, seniority: person.seniority,
        linkedin_url: person.linkedin_url, email: person.email,
        city: person.city, state: person.state, country: person.country,
      };
      if (person.organization) {
        enrichment.company = {
          name: person.organization.name, domain: person.organization.primary_domain,
          industry: person.organization.industry, employees: person.organization.estimated_num_employees,
          revenue: person.organization.annual_revenue_printed, founded: person.organization.founded_year,
          phone: person.organization.phone, linkedin: person.organization.linkedin_url,
        };
      }
    } else if (m && m._error) {
      enrichment.person_error = m._error;
    }

    // 2. Buying committee at the same company
    const domain = (enrichment.company && enrichment.company.domain) || domainOf(v);
    if (domain) {
      const s = await apollo('/mixed_people/search', key, {
        q_organization_domains: domain,
        person_seniorities: ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director'],
        page: 1, per_page: 10,
      }).catch(e => ({ _error: e.message }));
      if (s && Array.isArray(s.people)) {
        enrichment.committee = s.people.map(p => ({
          name: p.name, title: p.title, seniority: p.seniority, linkedin_url: p.linkedin_url,
        }));
      } else if (s && s._error) {
        enrichment.committee_error = s._error;
      }
    }
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  // Backfill thin fields on the visitor from enrichment.
  const patch = { enrichment };
  if (!v.company && enrichment.company && enrichment.company.name) patch.company = enrichment.company.name;
  if (!v.company_domain && enrichment.company && enrichment.company.domain) patch.company_domain = enrichment.company.domain;
  if (!v.industry && enrichment.company && enrichment.company.industry) patch.industry = enrichment.company.industry;
  if (!v.company_size && enrichment.company && enrichment.company.employees) patch.company_size = String(enrichment.company.employees);
  if (!v.title && enrichment.person && enrichment.person.title) patch.title = enrichment.person.title;

  await db.from('site_visitors').update(patch).eq('id', id);
  return res.json({ ok: true, enrichment });
};

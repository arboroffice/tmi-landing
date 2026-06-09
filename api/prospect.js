const { getSupabase } = require('./_supabase');
const { requireAuth, cors } = require('./_auth');

// Prospecting console - Apollo-powered people search + add-to-leads.
// POST { action:'search', ...filters } -> trimmed people list + pagination.
// POST { action:'add', person:{...} }  -> upsert contact by email + insert lead.
// Needs APOLLO_API_KEY. Returns { needs_key:true } if unset. Never 500s on an
// Apollo error - it captures the status + body and returns it as apollo_error.

const APOLLO = 'https://api.apollo.io/api/v1';

// Map a friendly company-size band to an Apollo employee-count range string.
function sizeRanges(companySize) {
  const map = {
    '1-10': ['1,10'],
    '11-50': ['11,50'],
    '51-200': ['51,200'],
    '201-500': ['201,500'],
    '501-1000': ['501,1000'],
    '1001-5000': ['1001,5000'],
    '5001+': ['5001,100000'],
  };
  if (!companySize) return null;
  return map[companySize] || null;
}

// Split a comma/newline separated string into a trimmed, non-empty array.
function toList(v) {
  if (!v) return null;
  if (Array.isArray(v)) v = v.join(',');
  const arr = String(v).split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

async function apolloSearch(key, body) {
  const r = await fetch(`${APOLLO}/mixed_people/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': key },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

function trimPerson(p) {
  const org = p.organization || {};
  return {
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' '),
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    title: p.title || null,
    company: org.name || p.organization_name || null,
    domain: org.primary_domain || org.website_url || null,
    linkedin_url: p.linkedin_url || null,
    email: p.email || null,
    email_status: p.email_status || null,
    city: p.city || null,
    state: p.state || null,
  };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAuth(req, res)) return;

  const key = process.env.APOLLO_API_KEY;
  if (!key) return res.status(200).json({ needs_key: true, key: 'APOLLO_API_KEY' });

  const body = req.body || {};
  const action = body.action;

  // ── Search ────────────────────────────────────────────────────────────────
  if (action === 'search') {
    const { title, industry, location, company_size, keywords, page } = body;

    const searchBody = {
      page: Number(page) > 0 ? Number(page) : 1,
      per_page: 25,
    };

    const titles = toList(title);
    if (titles) searchBody.person_titles = titles;

    const locations = toList(location);
    if (locations) searchBody.person_locations = locations;

    const sizes = sizeRanges(company_size);
    if (sizes) searchBody.organization_num_employees_ranges = sizes;

    // Industry + keywords both feed Apollo's keyword query. Keep them distinct
    // strings joined so a recruiter can search 'plumbing' industry + 'commercial'.
    const kw = [industry, keywords].filter(Boolean).join(' ').trim();
    if (kw) searchBody.q_keywords = kw;

    let result;
    try {
      result = await apolloSearch(key, searchBody);
    } catch (e) {
      return res.status(200).json({ apollo_error: { status: 0, body: e.message } });
    }

    if (!result.ok) {
      return res.status(200).json({
        apollo_error: {
          status: result.status,
          body: JSON.stringify(result.json).slice(0, 300),
        },
      });
    }

    const people = Array.isArray(result.json.people) ? result.json.people.map(trimPerson) : [];
    const pg = result.json.pagination || {};
    return res.json({
      people,
      pagination: {
        page: pg.page || searchBody.page,
        per_page: pg.per_page || searchBody.per_page,
        total_entries: pg.total_entries || people.length,
        total_pages: pg.total_pages || 1,
      },
    });
  }

  // ── Add to leads ────────────────────────────────────────────────────────────
  if (action === 'add') {
    const person = body.person || {};

    let db;
    try { db = getSupabase(); } catch (e) { return res.status(503).json({ error: e.message }); }

    // Derive first/last name from whatever Apollo gave us.
    let firstName = person.first_name;
    let lastName = person.last_name;
    if (!firstName && person.name) {
      const parts = String(person.name).trim().split(/\s+/);
      firstName = parts.shift() || '';
      lastName = parts.join(' ') || null;
    }
    if (!firstName) return res.status(400).json({ error: 'person name required' });

    const notes = [
      person.linkedin_url ? `LinkedIn: ${person.linkedin_url}` : null,
      person.domain ? `Domain: ${person.domain}` : null,
      person.email_status ? `Email status: ${person.email_status}` : null,
      [person.city, person.state].filter(Boolean).join(', ') || null,
    ].filter(Boolean).join(' - ');

    const contact = {
      first_name: firstName,
      last_name: lastName || null,
      email: person.email || null,
      phone: null,
      company: person.company || null,
      title: person.title || null,
      niche: null,
      notes: notes || null,
    };

    // Upsert contact by email (mirrors api/leads.js), or create without email.
    let contactId;
    if (contact.email) {
      const existing = await db.from('contacts').select('id').eq('email', contact.email).maybeSingle();
      if (existing.data) {
        contactId = existing.data.id;
        await db.from('contacts').update(contact).eq('id', contactId);
      }
    }
    if (!contactId) {
      const { data: c, error: ce } = await db.from('contacts').insert(contact).select().single();
      if (ce) return res.status(500).json({ error: ce.message });
      contactId = c.id;
    }

    const lead = {
      contact_id: contactId,
      name: person.name || [firstName, lastName].filter(Boolean).join(' '),
      email: contact.email,
      status: 'new',
      source: 'apollo-prospect',
      notes: notes || null,
    };

    const { data, error } = await db
      .from('leads')
      .insert(lead)
      .select('*, contacts(*)')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  return res.status(400).json({ error: 'unknown action' });
};

// Apollo.io API wrapper
// Docs: https://apolloio.github.io/apollo-api-docs/

const BASE = 'https://api.apollo.io/v1';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': process.env.APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Apollo ${path} ${res.status}: ${err}`);
  }
  return res.json();
}

function domainFromUrl(url) {
  if (!url) return null;
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

// ICP-precise prospecting: search PEOPLE (decision-makers) constrained by company
// size, industry keywords, and location. Returns company + contact in one shot.
// employeeRanges use Apollo's format, e.g. ['21,50','51,100','101,200','201,500'].
export async function searchProspects({
  titles,
  employeeRanges,
  industries = [],
  locations = ['United States'],
  revenueMin = null,
  page = 1,
  perPage = 25,
}) {
  const body = {
    person_titles: titles,
    organization_num_employees_ranges: employeeRanges,
    person_locations: locations,
    page,
    per_page: perPage,
  };
  if (industries.length) body.q_organization_keyword_tags = industries;
  if (revenueMin) body['revenue_range[min]'] = revenueMin;

  const data = await post('/mixed_people/search', body);
  const people = data.people || [];
  return people.map(p => {
    const org = p.organization || p.account || {};
    return {
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      title: p.title || '',
      email: p.email || null,
      apolloId: p.id,
      linkedinUrl: p.linkedin_url || null,
      company: org.name || null,
      domain: org.primary_domain || domainFromUrl(org.website_url),
      website: org.website_url || null,
      industry: org.industry || null,
      employeeCount: org.estimated_num_employees || null,
      revenue: org.annual_revenue_printed || null,
      location: [org.city, org.state].filter(Boolean).join(', ') || null,
      phone: org.phone || org.sanitized_phone || null,
    };
  });
}

// Find a decision-maker at a company by domain + target titles
export async function findContact({ domain, targetTitles }) {
  const data = await post('/mixed_people/search', {
    q_organization_domains: domain,
    person_titles: targetTitles,
    page: 1,
    per_page: 5,
  });

  const people = data.people || [];
  if (!people.length) return null;

  // Return the first person with an email, or the first person period
  const withEmail = people.find(p => p.email);
  const person = withEmail || people[0];

  return {
    name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
    firstName: person.first_name || '',
    title: person.title || '',
    email: person.email || null,
    linkedinUrl: person.linkedin_url || null,
    apolloId: person.id,
  };
}

// Enrich a contact to get their verified email
export async function getEmail({ apolloId }) {
  if (!apolloId) return null;
  try {
    const data = await post('/people/match', {
      id: apolloId,
      reveal_personal_emails: false,
    });
    return data.person?.email || null;
  } catch {
    return null;
  }
}

// Enrich a company by domain
export async function enrichCompany({ domain }) {
  try {
    const data = await post('/organizations/enrich', { domain });
    const org = data.organization;
    if (!org) return null;
    return {
      name: org.name,
      website: org.website_url,
      industry: org.industry,
      employeeCount: org.estimated_num_employees,
      revenue: org.annual_revenue_printed,
      foundedYear: org.founded_year,
      location: [org.city, org.state].filter(Boolean).join(', '),
      linkedinUrl: org.linkedin_url,
      phone: org.phone,
    };
  } catch {
    return null;
  }
}

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
      location: [org.city, org.state].filter(Boolean).join(', '),
      linkedinUrl: org.linkedin_url,
      phone: org.phone,
    };
  } catch {
    return null;
  }
}

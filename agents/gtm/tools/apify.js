// Apify API wrapper
// Used for Google Maps business scraping and LinkedIn scraping

const BASE = 'https://api.apify.com/v2';

// Run an Apify actor synchronously and return results
async function runActor(actorId, input, { timeoutSecs = 120 } = {}) {
  const token = process.env.APIFY_API_TOKEN;
  const url = `${BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSecs}&memory=512`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Apify ${actorId} ${res.status}: ${err}`);
  }

  return res.json(); // returns array of items
}

// Find local businesses via Google Maps
// Returns array of: { name, website, phone, address, reviewCount, rating, category }
export async function findBusinessesOnMaps({ searchQuery, location, maxResults = 20 }) {
  const items = await runActor('compass/crawler-google-places', {
    searchStringsArray: [`${searchQuery} near ${location}`],
    maxCrawledPlaces: maxResults,
    language: 'en',
    exportPlaceUrls: false,
    additionalInfo: false,
  }, { timeoutSecs: 180 });

  return (items || []).map(item => ({
    name: item.title,
    website: item.website || null,
    phone: item.phone || null,
    address: item.address || null,
    city: item.city || null,
    state: item.state || null,
    reviewCount: item.reviewsCount || 0,
    rating: item.totalScore || null,
    category: item.categoryName || null,
    googleMapsUrl: item.url || null,
  })).filter(b => b.name && b.website); // only businesses with a website
}

// Look up ONE specific business on Google Maps (for the audit research pass).
// Returns the best match's public profile: rating, review count, category, hours,
// address, service-area flags. Best-effort and time-boxed; returns null on miss.
export async function lookupBusinessOnMaps({ name, location, website }) {
  if (!process.env.APIFY_API_TOKEN || !name) return null;
  try {
    const items = await runActor('compass/crawler-google-places', {
      searchStringsArray: [location ? `${name} ${location}` : name],
      maxCrawledPlaces: 3,
      language: 'en',
      exportPlaceUrls: false,
      additionalInfo: true,
    }, { timeoutSecs: 50 });

    const list = items || [];
    if (!list.length) return null;
    const dom = website ? extractDomain(website) : null;
    const match = (dom && list.find(i => i.website && extractDomain(i.website) === dom)) || list[0];
    if (!match) return null;
    return {
      name: match.title || null,
      rating: match.totalScore || null,
      reviewCount: match.reviewsCount || 0,
      category: match.categoryName || null,
      categories: match.categories || [],
      address: match.address || null,
      city: match.city || null,
      state: match.state || null,
      phone: match.phone || null,
      website: match.website || null,
      hours: Array.isArray(match.openingHours) ? match.openingHours.map(h => `${h.day}: ${h.hours}`) : null,
      permanentlyClosed: !!match.permanentlyClosed,
      googleMapsUrl: match.url || null,
    };
  } catch {
    return null;
  }
}

// Scrape a LinkedIn company page for more details
// Returns: { name, description, employeeCount, industry, website }
export async function scrapeLinkedInCompany({ linkedinUrl }) {
  if (!linkedinUrl) return null;
  try {
    const items = await runActor('2SyF0bVxmgGr8IVCZ', {
      startUrls: [{ url: linkedinUrl }],
      count: 1,
    }, { timeoutSecs: 60 });

    const item = items?.[0];
    if (!item) return null;
    return {
      name: item.name,
      description: item.description,
      employeeCount: item.employeeCount,
      industry: item.industry,
      website: item.website,
      founded: item.foundedOn,
      specialties: item.specialities,
    };
  } catch {
    return null; // LinkedIn scraping can fail - that's ok
  }
}

// Extract domain from a URL
export function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

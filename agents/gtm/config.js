// ICP and prospecting configuration
// Edit this to target the right companies and geographies

export const ICP = {
  // Priority industries (Google Maps search terms) - operations-heavy businesses $5M-$500M
  industries: [
    'manufacturing company',
    'industrial services company',
    'oilfield services company',
    'fleet management company',
    'trucking company',
    'logistics company',
    'construction company',
    'equipment rental company',
    'marine services company',
    'waste management company',
    'commercial HVAC company',
    'electrical contractor',
    'plumbing company',
    'roofing company',
    'machine shop',
    'multi location medical group',
  ],

  // Cities to prospect in (rotate through these for volume)
  cities: [
    'Houston TX', 'Dallas TX', 'San Antonio TX', 'Midland TX', 'Fort Worth TX',
    'Denver CO', 'Phoenix AZ', 'Atlanta GA', 'Charlotte NC', 'Nashville TN',
    'Oklahoma City OK', 'Tulsa OK', 'Chicago IL', 'Cleveland OH', 'Pittsburgh PA',
    'Birmingham AL', 'Kansas City MO', 'Indianapolis IN', 'Tampa FL', 'New Orleans LA',
  ],

  // Decision-maker titles to target (Apollo people search)
  targetTitles: [
    'Owner',
    'CEO',
    'President',
    'Founder',
    'General Manager',
    'Operations Manager',
  ],

  // Revenue signals (Google Maps fallback: 10+ reviews ~ established business)
  minReviews: 10,

  // Apollo-first prospecting (ICP filters). Employee ranges use Apollo's format.
  // 20-500 employees, operations-heavy. Revenue $5M-$500M correlates with this band.
  employeeRanges: ['21,50', '51,100', '101,200', '201,500'],
  // Industry keyword tags (matched against Apollo org keywords)
  industryKeywords: [
    'manufacturing', 'industrial services', 'oil and gas', 'oilfield services',
    'fleet', 'transportation', 'logistics', 'construction', 'equipment rental',
    'marine', 'waste management', 'distribution', 'fabrication',
  ],
  locations: ['United States'],
};

// Lead source: 'apollo' (ICP search, default when APOLLO_API_KEY set) or 'maps' (Apify fallback)
export const SOURCE = process.env.GTM_SOURCE || (process.env.APOLLO_API_KEY ? 'apollo' : 'maps');

// $5M+ revenue floor (Apollo proxy). Used as a soft revenue filter.
export const REVENUE_MIN = 5000000;

// Outbound runs two parallel tracks, ~100/day each, both $5M+:
//  - industrial: manufacturing, oil & gas, fleet, construction, etc.
//  - service:    home service, aesthetics/med spa, wellness, healthcare groups,
//                multi-location service businesses, etc.
// Each can point at its own Instantly campaign so the copy fits the niche.
export const SEGMENTS = {
  industrial: {
    label: 'Industrial',
    leadsPerDay: 100,
    employeeRanges: ['21,50', '51,100', '101,200', '201,500'],
    titles: ['Owner', 'CEO', 'President', 'Founder', 'General Manager', 'VP Operations', 'Operations Manager', 'COO'],
    industryKeywords: [
      'manufacturing', 'industrial services', 'oil and gas', 'oilfield services',
      'fleet', 'transportation', 'logistics', 'construction', 'equipment rental',
      'marine', 'waste management', 'distribution', 'fabrication', 'mining',
    ],
    campaignId: process.env.INSTANTLY_CAMPAIGN_ID_INDUSTRIAL || process.env.INSTANTLY_CAMPAIGN_ID,
  },
  service: {
    label: 'Service & Wellness',
    leadsPerDay: 100,
    // High-revenue service businesses can be leaner, so include 11-20.
    employeeRanges: ['11,20', '21,50', '51,100', '101,200', '201,500'],
    titles: ['Owner', 'CEO', 'President', 'Founder', 'Practice Manager', 'General Manager', 'Director of Operations', 'Operations Manager', 'COO'],
    industryKeywords: [
      'home services', 'hvac', 'plumbing', 'electrical', 'roofing', 'restoration',
      'pest control', 'landscaping', 'med spa', 'medical spa', 'aesthetics',
      'dental', 'orthodontics', 'wellness', 'physical therapy', 'chiropractic',
      'veterinary', 'property management', 'auto repair', 'franchise', 'home health',
      'multi location healthcare', 'fitness',
    ],
    campaignId: process.env.INSTANTLY_CAMPAIGN_ID_SERVICE || process.env.INSTANTLY_CAMPAIGN_ID,
  },
};

export const LIMITS = {
  leadsPerDay: 100,      // new prospects to find, audit, and contact per day
  maxCombosPerRun: 24,   // industry x city searches to try before stopping
  maxFollowups: 5,       // cold + 3 follow-ups + playbook + breakup
  followupDays: [3, 7, 14, 21, 28],  // approx send days after the cold email
};

export const SENDER = {
  name: 'TMI',
  from: process.env.OUTREACH_FROM_EMAIL || 'hello@mail.tmitechai.com',
  replyTo: process.env.OUTREACH_REPLY_TO || 'support@tmitechai.com',
};

// TMI social accounts - where repurposed content gets published
export const SOCIAL = {
  linkedin: {
    companyId: '116333936',
    url: 'https://www.linkedin.com/company/116333936/admin/',
    // For auto-posting: needs LinkedIn Community Management API OAuth token
    // env: LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_URN (urn:li:organization:116333936)
  },
  instagram: {
    handle: 'tmitech',
    url: 'https://www.instagram.com/tmitech/',
    // For auto-posting: needs Instagram Graph API (business account + FB page link)
    // env: IG_USER_ID, META_ACCESS_TOKEN
  },
  facebook: {
    pageId: '61589248780094',
    url: 'https://www.facebook.com/profile.php?id=61589248780094',
    // For auto-posting: needs Facebook Graph API page token
    // env: FB_PAGE_ID, META_ACCESS_TOKEN
  },
};

// ICP and prospecting configuration
// Edit this to target the right companies and geographies

export const ICP = {
  // Industries to search (used as Google Maps search terms)
  industries: [
    'HVAC company',
    'roofing company',
    'plumbing company',
    'electrical contractor',
    'construction company',
    'oilfield services company',
    'trucking company',
    'fleet management company',
    'landscaping company',
    'property management company',
  ],

  // Cities to prospect in (rotate through these)
  cities: [
    'Houston TX',
    'Dallas TX',
    'Denver CO',
    'Phoenix AZ',
    'Atlanta GA',
    'Charlotte NC',
    'Nashville TN',
    'Oklahoma City OK',
    'Tulsa OK',
    'Midland TX',
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

  // Revenue signals (Google Maps: look for companies with 10+ reviews as proxy for established biz)
  minReviews: 10,
};

export const LIMITS = {
  leadsPerDay: 20,       // max new leads to find and contact per day
  maxFollowups: 3,       // cold + 2 follow-ups + 1 breakup
  followupDays: [3, 7, 14],  // days after last contact to send each follow-up
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

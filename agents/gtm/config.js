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

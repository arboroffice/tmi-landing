// The active TMI go-to-market campaign: the Intelligent Company Shift, run as a
// market-saturation play against one beachhead at a time. Shared config the
// prospecting, preview, and outbound agents read so they all target the same
// market and speak the same angle. Positive framing only, never "bottleneck".

export const CAMPAIGN = {
  name: 'Intelligent Company Shift',
  positioning: 'We redesign industrial companies into intelligent companies. Lead with visibility (the free Business Intelligence Audit), not AI.',
  angle: 'What your company looks like as an intelligent company. Opportunity and upside, never a critique.',

  offer: {
    name: 'Business Intelligence Audit',
    url: 'https://tmitechai.com/audit',
    cta: 'Book your Business Intelligence Audit',
    deliver: ['30-minute walkthrough', 'Company Intelligence Score (1-100)', '30-day roadmap', 'estimated annual upside'],
  },

  // Beachhead first, then copy the whole machine to the next market.
  market: { name: 'Acadiana', geo: ['Lafayette, LA', 'Acadiana', 'Louisiana', 'United States'], expandNext: ['Lake Charles, LA', 'Baton Rouge, LA', 'Houston, TX'] },

  icp: {
    revenueMin: 2_000_000,
    employeeRanges: ['11,20', '21,50', '51,100', '101,200', '201,500'],
    titles: ['Owner', 'Founder', 'President', 'CEO', 'COO', 'General Manager', 'VP Operations'],
    industries: ['hvac', 'roofing', 'construction', 'plumbing', 'electrical', 'home service', 'oil and gas', 'manufacturing', 'industrial', 'logistics', 'trucking', 'equipment rental', 'field service'],
  },

  // How hard each tier gets hit (the saturation stack).
  tiers: {
    top: { size: 100, plays: ['preview', 'email', 'direct-mail', 'walk-in', 'event', 'retargeting'] },
    mid: { size: 500, plays: ['preview', 'email', 'retargeting'] },
    rest: { size: null, plays: ['email', 'content'] },
  },

  // Cold send limits. dailyCap = new first-touches added to Instantly per day.
  // Set your Instantly campaign's own daily send limit to match your inbox count.
  sending: { channel: 'instantly', dailyCap: 50 },

  // The always-on email sequence (positive, intelligent-company framing).
  sequence: [
    { day: 0, angle: 'the shift', link: false },
    { day: 3, angle: 'bump' },
    { day: 6, angle: 'industry opportunity' },
    { day: 10, angle: 'what it looks like', link: true },
    { day: 14, angle: 'open door' },
  ],

  // Signals that make an account "hot" and worth a personalized preview first.
  signals: ['hiring a dispatcher/coordinator', 'hiring data entry / office admin', 'rapid growth', 'new location', 'new contract or award', 'leadership change', 'weak reviews on responsiveness'],
};

export default CAMPAIGN;

// Intent agent configuration. What TMI builds, who it's for, and the queries
// the agent watches across job boards and social/LinkedIn. Tune freely.

// One paragraph the classifier reads to ground every judgement.
export const TMI_CONTEXT = `TMI is a fractional AI and operations department for trades and industrial businesses doing $5M+ a year: HVAC, plumbing, electrical, roofing, mechanical and specialty contractors, construction, oil and gas, manufacturing, fabrication, machine shops, fleet and logistics, equipment rental, industrial and field services, mining, and marine. TMI runs one model: delete the software a company does not use, connect what is left, and build the operational backend they own - operating systems, digital employees (AI workers that handle dispatch, intake, follow-up, reporting, scheduling, estimating, data entry), and backend infrastructure. The buyer is the owner, founder, CEO, GM, or operations leader of a physical, operations-heavy company with crews, trucks, jobs, or a shop floor. A real signal is someone who would plausibly pay TMI: they are hiring for a dispatch, coordination, scheduling, estimating, or back-office ops role a digital employee replaces or augments; or they are publicly shopping for, evaluating, or frustrated with dispatch, field-service, job-costing, fleet, or operations software for a trades or industrial business. Office-only software companies, e-commerce stores, agencies, creators, coaches, and consumer apps are NOT a fit.`;

// Job-board searches that signal "a trades/industrial operator has manual ops a digital employee replaces."
export const JOB_QUERIES = [
  'dispatcher HVAC', 'dispatch coordinator roofing', 'service coordinator mechanical contractor',
  'field operations manager construction', 'operations coordinator oilfield', 'dispatcher plumbing electrical',
  'fleet dispatcher trucking', 'estimator electrical contractor', 'project coordinator construction',
  'operations manager manufacturing', 'shop scheduler machine shop', 'logistics coordinator industrial',
];

// LinkedIn / social keyword searches for buying-intent chatter from trades/industrial
// owners shopping for or frustrated with dispatch, field-service, and ops software.
export const SOCIAL_QUERIES = [
  'field service management software recommendations',
  'dispatch software for contractors',
  'best software to run my HVAC business',
  'job costing software construction',
  'fleet management software recommendations',
  'software to schedule and dispatch crews',
  'oilfield ticketing software',
  'replace manual scheduling contractor',
];

// Subreddits where trades/industrial owners shop for / complain about ops software.
export const SUBREDDITS = [
  'HVAC', 'electricians', 'Plumbing', 'Construction', 'roofing', 'Welding',
  'Machinists', 'Trucking', 'oilandgasworkers', 'Tradesmen', 'smallbusiness', 'manufacturing',
];

// Qualification thresholds (0-100). A candidate must clear all three to route.
export const THRESHOLDS = {
  icpFit: 55,      // how well the company/person fits TMI's ICP
  intent: 50,      // strength of the buying/hiring intent
  confidence: 55,  // model's confidence the read is correct
  // Above this combined bar we auto-route into the SDR pipeline; below it the
  // signal is stored for human review in /admin-signals instead of auto-acting.
  autoRoute: 70,
};

// Per-run volume caps so a daily run stays cheap and fast.
export const INTENT_LIMITS = {
  jobsPerQuery: 12,
  jobQueriesPerRun: 4,
  socialPerQuery: 10,
  socialQueriesPerRun: 4,
  redditPerSub: 10,
  subredditsPerRun: 4,
  permitsPerSource: 15,
  expansionPerQuery: 6,
  expansionQueriesPerRun: 5,
  maxClassifyPerRun: 80,
};

// Building/trade permit datasets on Socrata (public; no key needed for modest
// volume). Each new permit = an active operator with fresh ops pain. Add your
// target cities here; field names vary per dataset, so each source declares which
// columns hold the company / description / date. Empty by default (opt in per metro).
export const PERMIT_SOURCES = [
  // { id: 'chicago', label: 'Chicago, IL', url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json',
  //   companyField: 'contact_1_name', textFields: ['work_description','reported_cost'], dateField: 'issue_date', portalUrl: 'https://data.cityofchicago.org' },
];

// Expansion / new-contract / new-facility news (Brave). A growing operator is a
// strained operator. Tuned to the trades/industrial ICP.
export const EXPANSION_QUERIES = [
  'contractor opens new facility',
  'manufacturer breaks ground new plant',
  'fleet company expands operations',
  'industrial services company wins contract',
  'oilfield services company adds crews',
  'construction company announces expansion',
  'HVAC company acquires',
  'logistics company new warehouse',
];

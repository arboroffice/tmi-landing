// Intent agent configuration. What TMI builds, who it's for, and the queries
// the agent watches across job boards and social/LinkedIn. Tune freely.

// One paragraph the classifier reads to ground every judgement.
export const TMI_CONTEXT = `TMI is a fractional AI and operations department for businesses doing $5M+ a year, concentrated in industrial, trades, oil and gas, construction, manufacturing, logistics, fleet, field service, e-commerce, SaaS, healthcare groups, and multi-location service businesses. TMI runs one model: delete the software a company does not use, connect what is left, and build the operational backend they own - operating systems, digital employees (AI workers that handle dispatch, intake, follow-up, reporting, scheduling, data entry), and backend infrastructure. The buyer is the founder, owner, CEO, or operator. A real signal is someone who would plausibly pay TMI: they are hiring for a coordination, dispatch, admin, or ops role that a digital employee replaces or augments; or they are publicly shopping for, asking about, frustrated with, or evaluating AI tools, automation, or operations software for an ICP-fit business.`;

// Job-board searches that signal "we have manual ops a digital employee replaces."
export const JOB_QUERIES = [
  'dispatcher', 'dispatch coordinator', 'operations coordinator',
  'field operations manager', 'field service coordinator', 'scheduler dispatcher',
  'data entry operations', 'office manager construction', 'operations administrator',
  'logistics coordinator', 'service coordinator', 'project coordinator construction',
];

// LinkedIn / social keyword searches for buying-intent chatter (people talking or
// commenting about AI ops products, automation, software sprawl, that fit our ICP).
export const SOCIAL_QUERIES = [
  'looking for AI tool to automate operations',
  'recommendations dispatch software',
  'too many software tools small business',
  'AI agent for my business',
  'automate scheduling and follow up',
  'best operations software for contractors',
  'replace manual data entry AI',
  'field service management software recommendations',
];

// Subreddits where ICP owners shop for / complain about ops software + AI.
export const SUBREDDITS = [
  'smallbusiness', 'Entrepreneur', 'msp', 'construction', 'HVAC',
  'Construction', 'logistics', 'manufacturing', 'AI_Agents', 'automation',
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
  maxClassifyPerRun: 80,
};

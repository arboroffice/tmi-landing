// The TMI offer ladder. One definition, so the rep copilot, the lead alerts, the
// checkout line item and the admin screens cannot drift apart again.
//
// They had drifted badly. The rep brain, the new-lead SMS and the Stripe product
// name all called the $5,000 product the "Intelligent Company Audit", while
// tmitechai.com prices the Intelligent Company Audit at $25,000 over thirty days
// and calls the $5,000 product the Executive Discovery Session. Same name, two
// prices, five times apart, in front of the same prospect.
//
// Source of truth: tmitechai.com/pricing.html. The wording below is the site's,
// deliberately, so a rep and a prospect reading the page hear the same sentence.
//
// Money note: prices here are for copy. The amounts actually charged still come
// from env (COMPLETE_AUDIT_PRICE_CENTS) and the commission rates from Firestore
// settings/rep_commission_rates, so nothing in this file moves a charge.

const DISCOVERY_CENTS = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 500000);

const money = (cents) => '$' + (cents / 100).toLocaleString('en-US');

const LADDER = [
  {
    step: '00',
    key: 'fit_call',
    name: 'Fit Call',
    price: 'Free',
    price_short: 'free',
    duration: '15 minutes',
    public: true,
    oneline: 'Work out whether TMI should be inside this company at all.',
    detail:
      'A short conversation at no cost. Some of these end with us saying TMI is not what ' +
      'you need yet, and that is a good outcome, better reached in fifteen minutes than ' +
      'after an invoice. It is the only free thing TMI offers.',
    book: 'https://www.tmitechai.com/intelligent-company-audit.html#book',
  },
  {
    step: '01',
    key: 'discovery_session',
    name: 'Executive Discovery Session',
    price: money(DISCOVERY_CENTS),
    price_short: money(DISCOVERY_CENTS),
    duration: 'A working session with TMI leadership',
    public: true,
    oneline: 'Find out whether there is a small problem here or a much bigger opportunity.',
    detail:
      'Operations, people, software, data, workflows, how much still runs through the ' +
      'owner, reporting, bottlenecks, what only lives in heads. You leave knowing what is ' +
      'broken, what it is costing, what to fix first and what not to touch yet. If there ' +
      'is not enough value to justify going deeper, we say so.',
    // This is the one a rep closes in the field.
    rep_sells: true,
  },
  {
    step: '02',
    key: 'intelligent_company_audit',
    name: 'Intelligent Company Audit',
    price: '$25,000',
    price_short: '$25,000',
    duration: '30 days',
    public: true,
    oneline: 'Map how the company actually works, not how anyone thinks it works.',
    detail:
      'Thirty days inside the business and fourteen deliverables, including a company ' +
      'process map, a systems map, a data map, a company knowledge map, an owner ' +
      'dependency report, a key employee risk report, a bottleneck report, a waste and ' +
      'cost review, an AI readiness assessment, an automation opportunity map and the ' +
      'Intelligent Company Roadmap. Every deliverable is theirs outright.',
  },
  {
    step: '03',
    key: 'build_and_release',
    name: 'Build and Release',
    price: 'Scoped from the roadmap',
    price_short: 'scoped from the roadmap',
    duration: 'Phase by phase',
    public: true,
    oneline: 'Custom agents, automations, software and integrations, depending on what the audit finds.',
    detail:
      'Fixed scope and fixed price per phase, in writing before any work begins. Not ' +
      'hourly, not a retainer against unspecified work, and not a number that moves once ' +
      'they have committed. Never quote a build total before the audit.',
  },
  {
    step: '04',
    key: 'ai_department',
    name: 'AI Department',
    price: '$10,000 per month',
    price_short: '$10,000/mo',
    duration: 'Monthly, its own agreement',
    // Internal only. The public site publishes exactly two figures, $5,000 and
    // $25,000; tmitechai.com has a check that fails the build on a third.
    public: false,
    oneline: 'Us inside the office, keeping the company current and the team able.',
    detail:
      'Hands-on AI setup, training built on their own work, a reusable company playbook, ' +
      'and one of their people trained to lead it. Starts whenever they want it, usually ' +
      'after the roadmap.',
  },
];

const by = {};
for (const o of LADDER) by[o.key] = o;

const REP_OFFER = by.discovery_session;   // what a rep closes at the door
const AUDIT = by.intelligent_company_audit;
const FIT_CALL = by.fit_call;

// One-line ladder, for an SMS or a brief. Public steps only.
const ladderLine = () =>
  LADDER.filter((o) => o.public)
    .map((o) => `${o.name} ${o.price_short}`)
    .join(' -> ');

// The pitch a rep or an alert should carry. Kept short enough for one SMS.
const pitch = () =>
  `${FIT_CALL.name} free ${FIT_CALL.duration} -> ${REP_OFFER.name} ${REP_OFFER.price} ` +
  `-> ${AUDIT.name} ${AUDIT.price} over ${AUDIT.duration} -> build scoped from the roadmap, ` +
  `fixed scope and fixed price. Never quote a build total.`;

module.exports = {
  LADDER, by, REP_OFFER, AUDIT, FIT_CALL,
  DISCOVERY_CENTS, money, ladderLine, pitch,
};

// The TMI offer ladder. One definition, so the rep copilot, the lead alerts,
// the checkout line item and the admin screens cannot drift apart again.
//
// Current, as of Oct 2026:
//   Fit Call                  free, 15 minutes   the only free thing
//   Intelligent Company Audit $25,000, 30 days   how an engagement starts
//   Build and Release         scoped from the roadmap, phase by phase
//   AI Department             $10,000/month, internal only
//
// Two things this file exists to stop happening again. The $5,000 product was
// called "the Intelligent Company Audit" in the rep brain, the new-lead SMS and
// the Stripe line item while the website priced the audit at $25,000, so the
// same prospect heard two prices five times apart under one name. Then that
// $5,000 step, the Executive Discovery Session, was withdrawn altogether: there
// is no paid step before the audit now.
//
// Source of truth: tmitechai.com/pricing.html. The wording below is the site's,
// deliberately, so a rep and a prospect hear the same sentence.
//
// Money note: prices here are for copy. The amount actually charged comes from
// COMPLETE_AUDIT_PRICE_CENTS and commission rates from Firestore
// settings/rep_commission_rates, so nothing in this file moves a charge.

const AUDIT_CENTS = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 2500000);

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
    key: 'intelligent_company_audit',
    name: 'Intelligent Company Audit',
    price: money(AUDIT_CENTS),
    price_short: money(AUDIT_CENTS),
    duration: '30 days',
    public: true,
    // This is what a rep closes now.
    rep_sells: true,
    oneline: 'Map how the company actually works, not how anyone thinks it works.',
    detail:
      'Thirty days inside the business and fourteen deliverables, including a company ' +
      'process map, a systems map, a data map, a company knowledge map, an owner ' +
      'dependency report, a key employee risk report, a bottleneck report, a waste and ' +
      'cost review, an AI readiness assessment, an automation opportunity map and the ' +
      'Intelligent Company Roadmap. Every deliverable is theirs outright.',
  },
  {
    step: '02',
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
    step: '03',
    key: 'ai_department',
    name: 'AI Department',
    price: '$10,000 per month',
    price_short: '$10,000/mo',
    duration: 'Monthly, its own agreement',
    // Internal only. The public site publishes exactly one figure, $25,000;
    // tmitechai.com has a check that fails the build on a second.
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

const REP_OFFER = by.intelligent_company_audit;   // what a rep closes at the door
const AUDIT = by.intelligent_company_audit;
const FIT_CALL = by.fit_call;

// One-line ladder, for an SMS or a brief. Public steps only.
const ladderLine = () =>
  LADDER.filter((o) => o.public)
    .map((o) => `${o.name} ${o.price_short}`)
    .join(' -> ');

// The pitch a rep or an alert should carry. Kept short enough for one SMS.
const pitch = () =>
  `${FIT_CALL.name} free ${FIT_CALL.duration} -> ${AUDIT.name} ${AUDIT.price} over ` +
  `${AUDIT.duration} -> build scoped from the roadmap, fixed scope and fixed price. ` +
  `There is no paid step before the audit. Never quote a build total.`;

module.exports = {
  LADDER, by, REP_OFFER, AUDIT, FIT_CALL,
  AUDIT_CENTS, money, ladderLine, pitch,
};

// The Complete Audit intake — the detailed questionnaire a paying client fills out
// before the 30-minute discovery call. Captures everything TMI needs to diagnose
// the operation and scope DIY / DWY / DFY. Drives the on-site form and grounds the
// detailed audit deliverable + the strategist's pre-call brief.
//
// Each question: { id, label, type, options?, help?, niche? }
// type: 'short' | 'long' | 'number' | 'money' | 'single' | 'multi' | 'scale' (1-10)

export const INTAKE = [
  {
    section: 'Company & context',
    questions: [
      { id: 'company', label: 'Company name', type: 'short' },
      { id: 'website', label: 'Website', type: 'short' },
      { id: 'industry', label: 'What does the business actually do, in one line?', type: 'short' },
      { id: 'years', label: 'How many years in business?', type: 'number' },
      { id: 'locations', label: 'How many locations / yards / sites?', type: 'number' },
      { id: 'revenue', label: 'Annual revenue (range is fine)', type: 'money' },
      { id: 'growth', label: 'Revenue trend over the last 2 years', type: 'single', options: ['Up sharply', 'Up steadily', 'Flat', 'Down'] },
      { id: 'seasonality', label: 'How seasonal is the business?', type: 'single', options: ['Very', 'Somewhat', 'Not really'] },
    ],
  },
  {
    section: 'Revenue & sales',
    questions: [
      { id: 'lead_sources', label: 'Where do new customers come from? (rank top 3)', type: 'long' },
      { id: 'lead_volume', label: 'Roughly how many new leads/inquiries a month?', type: 'number' },
      { id: 'response_time', label: 'When a lead comes in, how fast do you respond, honestly?', type: 'single', options: ['Minutes', 'Hours', 'Next day', 'When we get to it'] },
      { id: 'who_sells', label: 'Who handles sales / quoting?', type: 'short' },
      { id: 'quote_process', label: 'Walk through how a quote/estimate gets created and sent', type: 'long' },
      { id: 'close_rate', label: 'Rough close rate on quotes (%)', type: 'number' },
      { id: 'avg_deal', label: 'Average job / deal / ticket size', type: 'money' },
      { id: 'crm', label: 'What CRM or system holds your leads and customers? (or "spreadsheets/none")', type: 'short' },
      { id: 'followup', label: 'What happens to a lead that does not buy right away?', type: 'long' },
    ],
  },
  {
    section: 'Team & the founder',
    questions: [
      { id: 'headcount', label: 'Total team size (employees + contractors)', type: 'number' },
      { id: 'org_breakdown', label: 'Rough breakdown by function (office, field/ops, sales, admin, leadership)', type: 'long' },
      { id: 'founder_role', label: 'What does the owner/founder personally still do every day?', type: 'long' },
      { id: 'founder_hours', label: 'Hours/week the owner works', type: 'number' },
      { id: 'cant_leave', label: 'Could the business run for 2 weeks without the owner? What breaks first?', type: 'long' },
      { id: 'key_people', label: 'Who are the 1-3 people the business cannot run without, and why?', type: 'long' },
      { id: 'tribal_knowledge', label: 'What critical knowledge lives only in someone\'s head?', type: 'long' },
      { id: 'hiring', label: 'Any roles you are hiring or wish you could stop hiring for?', type: 'long' },
    ],
  },
  {
    section: 'Operations & fulfillment',
    questions: [
      { id: 'work_flow', label: 'Walk through how a job goes from sold to delivered to paid', type: 'long' },
      { id: 'scheduling', label: 'How do you schedule / dispatch work and people?', type: 'long' },
      { id: 'field_office', label: 'How does the field talk to the office during a job?', type: 'long' },
      { id: 'capacity', label: 'How do you know if you are at, over, or under capacity right now?', type: 'long' },
      { id: 'dropped_balls', label: 'Where do things most often fall through the cracks?', type: 'long' },
      { id: 'rework', label: 'How often does work get redone / called back, and why?', type: 'long' },
    ],
  },
  {
    section: 'Tools & systems',
    questions: [
      { id: 'tools_list', label: 'List every software tool the business pays for', type: 'long' },
      { id: 'tools_spend', label: 'Rough total monthly software spend', type: 'money' },
      { id: 'unused_tools', label: 'Which tools does almost nobody actually use?', type: 'long' },
      { id: 'spreadsheets', label: 'What runs on spreadsheets, texts, paper, or whiteboards?', type: 'long' },
      { id: 'connected', label: 'Do your tools talk to each other, or is data re-entered by hand? Where?', type: 'long' },
      { id: 'system_of_record', label: 'If you had to find the true status of any job right now, where would you look?', type: 'long' },
    ],
  },
  {
    section: 'Money, admin & reporting',
    questions: [
      { id: 'invoicing', label: 'How and when do invoices go out after a job?', type: 'long' },
      { id: 'ar', label: 'How do you track who owes you money?', type: 'long' },
      { id: 'job_costing', label: 'Do you know your margin per job/customer? How?', type: 'single', options: ['Yes, clearly', 'Roughly', 'Not really', 'No'] },
      { id: 'books', label: 'Who does the books / payroll, and on what system?', type: 'short' },
      { id: 'reporting', label: 'What numbers do you look at to run the business, and where do they come from?', type: 'long' },
      { id: 'gut_vs_data', label: 'Most decisions are made on:', type: 'single', options: ['Data', 'A mix', 'Gut and experience'] },
      { id: 'blind_spots', label: 'What do you most wish you could see but cannot today?', type: 'long' },
    ],
  },
  {
    section: 'Compliance & risk',
    questions: [
      { id: 'compliance', label: 'Any certifications, licenses, safety, or compliance docs you must keep current?', type: 'long', niche: 'industrial' },
      { id: 'compliance_track', label: 'How do you track expirations / renewals / inspections today?', type: 'long', niche: 'industrial' },
      { id: 'risk', label: 'What operational mistake would cost you the most if it happened?', type: 'long' },
    ],
  },
  {
    section: 'Goals & path',
    questions: [
      { id: 'biggest_bottleneck', label: 'In your words, what is the single biggest thing holding the business back?', type: 'long' },
      { id: 'tried', label: 'What have you already tried to fix it, and what happened?', type: 'long' },
      { id: 'fixed_looks_like', label: 'If this were fixed, what would change for you personally?', type: 'long' },
      { id: 'goal_12mo', label: 'Where do you want the business in 12 months?', type: 'long' },
      { id: 'urgency', label: 'How urgent is solving this?', type: 'scale' },
      { id: 'path', label: 'How would you want to build this with us?', type: 'single', options: ['DIY (we give you the plan + tools)', 'DWY (we build it with your team)', 'DFY (we build and run it for you)', 'Not sure yet'] },
      { id: 'budget', label: 'Rough budget range you have in mind for solving this', type: 'money' },
      { id: 'timeline', label: 'When would you want to start?', type: 'single', options: ['Now', 'This quarter', 'This year', 'Just exploring'] },
      { id: 'decision', label: 'Who else is involved in a decision like this?', type: 'short' },
    ],
  },
];

// Flat list of all question ids (for validation / storage).
export const INTAKE_IDS = INTAKE.flatMap(s => s.questions.map(q => q.id));

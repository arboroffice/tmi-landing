// TMI OS - Marketplace catalog. Prebuilt, industry-agnostic roles, departments,
// and workflows any business can install into its OS in one tap. Each template is
// a plain spec; os2-market.js provisions it into real tenant-scoped objects.
//
// kind is one of 'worker' | 'department' | 'workflow' | 'pack'.
//   worker     spec: { name, job, autonomy, cadence }
//              autonomy: read | approve | auto   cadence: realtime | daily | weekly
//   department spec: { name, mandate }
//   workflow   spec: { name, trigger, steps: [strings] }
//   pack       spec: { department:{name,mandate}, workers:[worker specs],
//                      metrics:[{label,unit,hint}], goals:[{title,target,timeframe}],
//                      workflows:[workflow specs] }  (a whole department in a box)
//
// Voice: direct, plain, no hype. Every template is horizontal so it fits any
// business, from a plumbing shop to a law firm.

const CATALOG = [
  // ---- Workers ------------------------------------------------------------
  {
    id: 'worker-front-desk',
    kind: 'worker',
    label: 'Front Desk Receptionist',
    tagline: 'Answers every inbound message, captures the details, and routes it to the right person.',
    category: 'Customer Service',
    spec: {
      name: 'Front Desk Receptionist',
      job: 'Greet every inbound call, text, and form. Capture name, contact, and reason for reaching out, answer common questions, and hand off anything that needs a person.',
      autonomy: 'auto',
      cadence: 'realtime',
    },
  },
  {
    id: 'worker-quote-followup',
    kind: 'worker',
    label: 'Quote Follow-up',
    tagline: 'Follows up on every open quote until the customer answers yes or no.',
    category: 'Sales',
    spec: {
      name: 'Quote Follow-up',
      job: 'Track every quote that has not been accepted or declined. Send a plain reminder on day 2 and day 5, answer basic questions, and flag hot ones for a call.',
      autonomy: 'approve',
      cadence: 'daily',
    },
  },
  {
    id: 'worker-proposal-writer',
    kind: 'worker',
    label: 'Proposal Writer',
    tagline: 'Turns a short brief into a clean, ready-to-send proposal in your format.',
    category: 'Sales',
    spec: {
      name: 'Proposal Writer',
      job: 'Take the notes from a sales conversation and draft a proposal with scope, pricing, and terms in the company template. Leave it in the owner queue for a final look.',
      autonomy: 'approve',
      cadence: 'realtime',
    },
  },
  {
    id: 'worker-collections-clerk',
    kind: 'worker',
    label: 'Collections Clerk',
    tagline: 'Chases every unpaid invoice on a schedule so cash stops sitting in the field.',
    category: 'Finance',
    spec: {
      name: 'Collections Clerk',
      job: 'Watch accounts receivable. Send a friendly reminder at 15 days, a firmer one at 30, and escalate anything past 45 to the owner with the full history.',
      autonomy: 'approve',
      cadence: 'daily',
    },
  },
  {
    id: 'worker-bookkeeper-assistant',
    kind: 'worker',
    label: 'Bookkeeper Assistant',
    tagline: 'Sorts transactions, flags what looks off, and keeps the books ready to close.',
    category: 'Finance',
    spec: {
      name: 'Bookkeeper Assistant',
      job: 'Categorize new transactions, match receipts to charges, and flag anything uncategorized or unusual for the bookkeeper to confirm before month end.',
      autonomy: 'approve',
      cadence: 'daily',
    },
  },
  {
    id: 'worker-scheduler',
    kind: 'worker',
    label: 'Scheduler',
    tagline: 'Books, confirms, and reschedules appointments so the calendar stays full and clean.',
    category: 'Operations',
    spec: {
      name: 'Scheduler',
      job: 'Take booking requests, place them in open slots, send confirmations, and handle reschedules and cancellations without double-booking anyone.',
      autonomy: 'auto',
      cadence: 'realtime',
    },
  },
  {
    id: 'worker-dispatch-coordinator',
    kind: 'worker',
    label: 'Dispatch Coordinator',
    tagline: 'Matches each job to the right crew and keeps the day running when plans change.',
    category: 'Operations',
    spec: {
      name: 'Dispatch Coordinator',
      job: 'Assign jobs to crews by skill, location, and availability. When something runs long or falls through, reshuffle the day and tell everyone affected.',
      autonomy: 'approve',
      cadence: 'realtime',
    },
  },
  {
    id: 'worker-review-requester',
    kind: 'worker',
    label: 'Review Requester',
    tagline: 'Asks every happy customer for a review at the moment they are most likely to leave one.',
    category: 'Marketing',
    spec: {
      name: 'Review Requester',
      job: 'After a completed job, send one simple review request to the customer, route unhappy replies to the owner first, and thank the ones who post.',
      autonomy: 'auto',
      cadence: 'daily',
    },
  },
  {
    id: 'worker-onboarding-concierge',
    kind: 'worker',
    label: 'Onboarding Concierge',
    tagline: 'Walks every new customer through the first steps so nobody falls through the cracks.',
    category: 'Customer Service',
    spec: {
      name: 'Onboarding Concierge',
      job: 'Guide each new customer through paperwork, first appointment, and what to expect. Check in on day 1 and day 7, and surface anyone who goes quiet.',
      autonomy: 'approve',
      cadence: 'daily',
    },
  },

  // ---- Departments --------------------------------------------------------
  {
    id: 'dept-sales',
    kind: 'department',
    label: 'Sales Department',
    tagline: 'One home for every lead, quote, and follow-up from first contact to signed work.',
    category: 'Sales',
    spec: {
      name: 'Sales',
      mandate: 'Turn inbound interest into signed work. Respond fast, quote clearly, follow up until every lead gets an answer, and never let a warm lead go cold.',
    },
  },
  {
    id: 'dept-operations',
    kind: 'department',
    label: 'Operations Department',
    tagline: 'Runs the daily plan so the right people are in the right place doing the right work.',
    category: 'Operations',
    spec: {
      name: 'Operations',
      mandate: 'Deliver the work on time and on budget. Schedule the day, match crews to jobs, track progress, and clear blockers before they cost hours.',
    },
  },
  {
    id: 'dept-finance',
    kind: 'department',
    label: 'Finance Department',
    tagline: 'Keeps money moving in, bills going out, and the owner clear on where cash stands.',
    category: 'Finance',
    spec: {
      name: 'Finance',
      mandate: 'Protect the cash. Invoice on time, collect what is owed, keep the books clean, and give the owner a straight read on money every week.',
    },
  },
  {
    id: 'dept-customer-service',
    kind: 'department',
    label: 'Customer Service Department',
    tagline: 'Handles every question, request, and issue so customers feel taken care of.',
    category: 'Customer Service',
    spec: {
      name: 'Customer Service',
      mandate: 'Take care of the customer after the sale. Answer questions fast, resolve issues cleanly, and turn a good job into a repeat customer.',
    },
  },

  // ---- Workflows ----------------------------------------------------------
  {
    id: 'wf-new-lead-intake',
    kind: 'workflow',
    label: 'New Lead Intake',
    tagline: 'Captures a new lead, confirms it, and puts it in front of sales within minutes.',
    category: 'Sales',
    spec: {
      name: 'New Lead Intake',
      trigger: 'lead_created',
      steps: [
        { type: 'task', title: 'Capture the lead: name, contact, and what they need', priority: 'high' },
        { type: 'notify', text: 'New lead came in. Send them a quick confirmation that you got it.' },
        { type: 'task', title: 'Assign a sales owner to this lead' },
        { type: 'notify', text: 'Sales owner: a new lead is waiting, with the details.' },
        { type: 'task', title: 'Follow up with the new lead today' },
      ],
    },
  },
  {
    id: 'wf-invoice-followup',
    kind: 'workflow',
    label: 'Invoice Follow-up',
    tagline: 'Reminds customers about open invoices on a set schedule until they pay.',
    category: 'Finance',
    spec: {
      name: 'Invoice Follow-up',
      trigger: 'invoice_overdue',
      steps: [
        { type: 'notify', text: 'Invoice is past due. Send a friendly reminder with the invoice and a payment link.' },
        { type: 'wait', days: 15 },
        { type: 'notify', text: 'Still unpaid. Send a firmer reminder with the payment link.' },
        { type: 'wait', days: 15 },
        { type: 'approval', prompt: 'Invoice is 30+ days past due. Approve escalating it to the owner.' },
        { type: 'task', title: 'Escalate the overdue invoice to the owner', priority: 'high' },
      ],
    },
  },
  {
    id: 'wf-missed-call-textback',
    kind: 'workflow',
    label: 'Missed Call Text-back',
    tagline: 'Texts back every missed call so a busy signal never costs you the job.',
    category: 'Customer Service',
    spec: {
      name: 'Missed Call Text-back',
      trigger: 'manual',
      steps: [
        { type: 'notify', text: 'Missed call: text them back within a minute, ask what they need, and offer a callback time.' },
        { type: 'task', title: 'Log the missed call and route the conversation to the right person' },
      ],
    },
  },
  {
    id: 'wf-post-job-review-request',
    kind: 'workflow',
    label: 'Post-Job Review Request',
    tagline: 'Asks for a review right after the work is done, when the customer is happiest.',
    category: 'Marketing',
    spec: {
      name: 'Post-Job Review Request',
      trigger: 'job_completed',
      steps: [
        { type: 'wait', until_ms: 7200000 },
        { type: 'notify', text: 'Job done. Send one short review request to the customer.' },
        { type: 'approval', prompt: 'If the rating is low, approve routing it to the owner before it posts.' },
        { type: 'notify', text: 'Thank the customer when their review goes live.' },
      ],
    },
  },
  {
    id: 'wf-weekly-owner-report',
    kind: 'workflow',
    label: 'Weekly Owner Report',
    tagline: 'Puts the week on one page every Monday so the owner sees the whole business fast.',
    category: 'Operations',
    spec: {
      name: 'Weekly Owner Report',
      trigger: 'manual',
      steps: [
        { type: 'notify', text: 'Pull the numbers that matter from the past week and compare to goals and the prior week.' },
        { type: 'task', title: 'Review what moved this week and what needs a decision' },
        { type: 'notify', text: 'One-page weekly summary delivered to the owner.' },
      ],
    },
  },

  // ---- Packs (a whole department in a box) --------------------------------
  {
    id: 'pack-finance',
    kind: 'pack',
    label: 'Finance Department',
    tagline: 'A full finance function in one tap: the department, its people, its numbers, and its follow-up.',
    category: 'Finance',
    spec: {
      department: {
        name: 'Finance',
        mandate: 'Protect the cash. Invoice on time, collect what is owed, keep the books clean, and give the owner a straight read on money every week.',
      },
      workers: [
        {
          name: 'Collections Clerk',
          job: 'Watch accounts receivable. Send a reminder at 15 days, a firmer one at 30, and escalate anything past 45 to the owner with the full history.',
          autonomy: 'approve',
          cadence: 'daily',
        },
        {
          name: 'Bookkeeper Assistant',
          job: 'Categorize new transactions, match receipts to charges, and flag anything uncategorized or unusual before month end.',
          autonomy: 'approve',
          cadence: 'daily',
        },
        {
          name: 'Invoice Clerk',
          job: 'Draft and send invoices as jobs complete, confirm the customer received them, and keep every invoice tied to its job.',
          autonomy: 'approve',
          cadence: 'daily',
        },
      ],
      metrics: [
        { label: 'Outstanding receivables', unit: 'USD', hint: 'Total unpaid invoices right now' },
        { label: 'Average days to pay', unit: 'days', hint: 'How long invoices take to get paid' },
        { label: 'Invoices sent this week', unit: 'count', hint: 'Billing kept current' },
      ],
      goals: [
        { title: 'Cut average days to pay under 20', target: '20 days', timeframe: 'this quarter' },
        { title: 'Keep receivables past 45 days near zero', target: 'under 2 percent of AR', timeframe: 'ongoing' },
      ],
      workflows: [
        {
          name: 'Invoice Follow-up',
          trigger: 'invoice_overdue',
          steps: [
            { type: 'notify', text: 'Invoice is past due. Send a friendly reminder with a payment link.' },
            { type: 'wait', days: 15 },
            { type: 'notify', text: 'Still unpaid. Send a firmer reminder.' },
            { type: 'approval', prompt: 'Invoice is 30+ days past due. Approve escalating it to the owner.' },
            { type: 'task', title: 'Escalate the overdue invoice to the owner', priority: 'high' },
          ],
        },
      ],
    },
  },
  {
    id: 'pack-customer-service',
    kind: 'pack',
    label: 'Customer Service Department',
    tagline: 'A full customer service function in one tap: the department, its people, its numbers, and its follow-up.',
    category: 'Customer Service',
    spec: {
      department: {
        name: 'Customer Service',
        mandate: 'Take care of the customer after the sale. Answer questions fast, resolve issues cleanly, and turn a good job into a repeat customer.',
      },
      workers: [
        {
          name: 'Front Desk Receptionist',
          job: 'Greet every inbound call, text, and form. Capture the details, answer common questions, and hand off anything that needs a person.',
          autonomy: 'auto',
          cadence: 'realtime',
        },
        {
          name: 'Onboarding Concierge',
          job: 'Guide each new customer through the first steps, check in on day 1 and day 7, and surface anyone who goes quiet.',
          autonomy: 'approve',
          cadence: 'daily',
        },
        {
          name: 'Review Requester',
          job: 'After a completed job, send one review request, route unhappy replies to the owner first, and thank customers who post.',
          autonomy: 'auto',
          cadence: 'daily',
        },
      ],
      metrics: [
        { label: 'First response time', unit: 'minutes', hint: 'How fast the first reply goes out' },
        { label: 'Open issues', unit: 'count', hint: 'Customer issues not yet resolved' },
        { label: 'Reviews collected this month', unit: 'count', hint: 'Happy customers on the record' },
      ],
      goals: [
        { title: 'Answer every message under 5 minutes', target: '5 minutes', timeframe: 'ongoing' },
        { title: 'Collect 20 new reviews', target: '20 reviews', timeframe: 'this month' },
      ],
      workflows: [
        {
          name: 'Missed Call Text-back',
          trigger: 'manual',
          steps: [
            { type: 'notify', text: 'Missed call: text them back within a minute, ask what they need, and offer a callback time.' },
            { type: 'task', title: 'Log the missed call and route it to the right person' },
          ],
        },
        {
          name: 'Post-Job Review Request',
          trigger: 'job_completed',
          steps: [
            { type: 'wait', until_ms: 7200000 },
            { type: 'notify', text: 'Job done. Send one short review request to the customer.' },
            { type: 'approval', prompt: 'If the rating is low, approve routing it to the owner before it posts.' },
            { type: 'notify', text: 'Thank the customer when their review goes live.' },
          ],
        },
      ],
    },
  },
  {
    id: 'pack-sales',
    kind: 'pack',
    label: 'Sales Department',
    tagline: 'A full sales function in one tap: the department, its people, its numbers, and its follow-up.',
    category: 'Sales',
    spec: {
      department: {
        name: 'Sales',
        mandate: 'Turn inbound interest into signed work. Respond fast, quote clearly, follow up until every lead gets an answer, and never let a warm lead go cold.',
      },
      workers: [
        {
          name: 'Quote Follow-up',
          job: 'Track every quote that is not yet accepted or declined, send reminders on day 2 and day 5, and flag hot ones for a call.',
          autonomy: 'approve',
          cadence: 'daily',
        },
        {
          name: 'Proposal Writer',
          job: 'Turn sales notes into a proposal with scope, pricing, and terms in the company template, and leave it for a final look.',
          autonomy: 'approve',
          cadence: 'realtime',
        },
      ],
      metrics: [
        { label: 'Open leads', unit: 'count', hint: 'Leads still waiting on a next step' },
        { label: 'Quote win rate', unit: 'percent', hint: 'Quotes that turn into signed work' },
        { label: 'Average response time', unit: 'minutes', hint: 'How fast new leads get a first reply' },
      ],
      goals: [
        { title: 'Respond to every new lead under 10 minutes', target: '10 minutes', timeframe: 'ongoing' },
        { title: 'Lift quote win rate to 40 percent', target: '40 percent', timeframe: 'this quarter' },
      ],
      workflows: [
        {
          name: 'New Lead Intake',
          trigger: 'lead_created',
          steps: [
            { type: 'task', title: 'Capture the lead: name, contact, and what they need', priority: 'high' },
            { type: 'notify', text: 'New lead came in. Send them a quick confirmation.' },
            { type: 'task', title: 'Assign a sales owner to this lead' },
            { type: 'notify', text: 'Sales owner: a new lead is waiting, with the details.' },
            { type: 'task', title: 'Follow up with the new lead today' },
          ],
        },
      ],
    },
  },
];

function getTemplate(id) {
  return CATALOG.find((t) => t.id === id) || null;
}

module.exports = { CATALOG, getTemplate };

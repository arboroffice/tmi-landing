"""
Add FAQPage JSON-LD + visible FAQ section to 11 remaining articles.
"""
import os, re
os.chdir(r'C:\Users\mialo\tmi-landing-1')

FAQ_CSS = """  .article-faq{padding:56px 0 16px;border-top:1px solid var(--line);}
  .article-faq .faq-heading{font-family:var(--sans);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--muted);margin-bottom:32px;}
  .article-faq .faq-item{border-top:1px solid var(--line);padding:24px 0;}
  .article-faq .faq-item:first-of-type{border-top:none;}
  .article-faq .faq-q{font-family:var(--serif);font-size:20px;font-weight:400;color:var(--ink);margin-bottom:12px;line-height:1.3;}
  .article-faq .faq-a{font-family:var(--serif);font-size:17px;color:var(--ink-2);line-height:1.65;}"""

ARTICLES = {
    'article-admin-burden.html': [
        ("How much time do contractors spend on administrative work?",
         "Studies of field service companies find that owners and office managers spend 35-50% of their time on administrative tasks: scheduling, invoicing, follow-up calls, paperwork processing, and reporting. For a company grossing $2M, that's the equivalent of $200,000-$350,000 in owner time spent on work that doesn't generate revenue and could be automated."),
        ("What administrative tasks can be automated for contractors?",
         "The administrative tasks with the highest automation potential for contractors are: job scheduling and dispatch (routing, assignment, reminders), invoice generation from job completion data, payment follow-up sequences, permit status tracking, and weekly reporting. These five categories account for 60-70% of admin overhead in most field service operations."),
        ("How do you reduce paperwork in a construction business?",
         "Reducing construction paperwork requires replacing paper forms with mobile capture at the point of work. Start with the daily report or job completion form - whichever generates the most downstream admin work. Once field data is captured digitally, downstream processes (invoicing, reporting, costing) can be automated. Paper reduction that starts at the office, not the field, doesn't stick."),
        ("What does back-office automation cost for small contractors?",
         "Back-office automation for small contractors (under 20 field staff) typically runs $500-$1,500 per month for platform-based solutions. Custom-built systems that integrate with existing software and handle company-specific workflows run $1,500-$3,000 per month. At either price point, the payback period is typically 60-120 days when measured against admin labor hours reduced."),
    ],
    'article-foreman.html': [
        ("What does a good construction foreman actually do?",
         "A good construction foreman does five things: translates the project plan into daily crew assignments, manages material flow so the crew is never waiting, resolves field problems before they escalate to the PM, captures daily progress against schedule, and maintains safety standards without slowing production. The best foremen run their job with a system - not improvisation."),
        ("How do you support a construction foreman with better systems?",
         "Supporting a foreman with better systems means giving them real-time visibility into what the crew needs before they need it: material deliveries confirmed on schedule, permit statuses updated, equipment availability for the next phase. A foreman spending 30 minutes a day chasing information that should be automatic is a foreman not running the job."),
        ("What is the biggest challenge for field foremen today?",
         "The biggest challenge for construction foremen today is coordination overhead - the time spent tracking down information that should be automatic. Confirming material deliveries, getting answers from the office on RFIs, updating schedule tracking, and managing subcontractor timing all eat into the time a foreman should spend running the work. The companies with the best foremen give them systems that handle the information, not more to track."),
        ("How do AI tools help construction foremen?",
         "AI tools help construction foremen by automating the information flow: triggering material orders when job phases are completed, surfacing relevant RFI responses when a crew needs them, updating the project schedule from field completion data, and flagging schedule conflicts before they become idle time. The goal is a foreman who spends their time on the job, not on the phone."),
    ],
    'article-estimators.html': [
        ("What makes a good construction estimator?",
         "A good construction estimator combines three capabilities: complete scope comprehension (not missing items), accurate production factor application (how long things actually take given your crew), and current material pricing. The best estimators operate from a calibrated database of historical costs rather than memory. Estimating from memory produces the highest variance - and variance means lost margin."),
        ("How do you build a better estimating system for contractors?",
         "Building a better estimating system requires capturing actual job costs consistently so estimates can be calibrated against reality. This means: tracking labor hours by task type, capturing material costs by job, recording subcontractor actuals, and comparing estimate to final cost at job close. Most companies have the data to build a calibrated estimating system - they just haven't connected it."),
        ("What software do construction estimators use?",
         "Construction estimators use a range from spreadsheets to purpose-built estimating platforms. The most common are Excel (most flexible, highest error rate), Buildxact and Clear Estimates (residential), DESTINI Estimator and WinEst (commercial), and Procore with estimating modules. The right choice depends on job type and volume, but any tool is only as accurate as the cost data feeding it."),
        ("How does AI change construction estimating?",
         "AI changes construction estimating by applying historical cost patterns automatically: flagging when a line item is priced outside the normal range for that job type, identifying missing scope items based on similar past projects, and adjusting material prices against current market data. The result is estimates that take less time and have tighter margin variance than estimates produced manually."),
    ],
    'article-electrician.html': [
        ("What AI tools are most useful for electrical contractors?",
         "The AI tools with the most practical value for electrical contractors are: automated scheduling and dispatch that accounts for licensing requirements (not all techs can do all work), permit tracking integrated into job scheduling, material procurement triggered by job phase, and same-day invoicing from field completion data. Most electrical contractors adopt one of these and see results before expanding."),
        ("How do electrical contractors manage licensing and certification requirements?",
         "Managing licensing requirements for electrical crews requires a database that tracks individual licenses, their scope of work authorization, and expiration dates, then enforces those requirements in job assignment. An unlicensed tech assigned to work requiring a master electrician is both a compliance risk and a liability. Most companies manage this manually; AI systems that enforce licensing rules in dispatch eliminate the risk."),
        ("What software do small electrical contractors use?",
         "Small electrical contractors most commonly use ServiceTitan, Jobber, or Housecall Pro for field operations. For estimating, AccuBid and Trimble's Electrical suite are standard. The gap most small electrical contractors face is integration - their scheduling, estimating, and invoicing don't talk to each other, creating manual work at every handoff. Custom-integrated systems close that gap."),
        ("How can electrical contractors improve profit margins?",
         "Electrical contractors improve profit margins through three levers: tighter estimating (reduce variance between bid and actual), faster billing cycles (invoice same-day instead of 5-11 days later), and better dispatch (reduce drive time and match tech skill to job requirements). Together, these three improvements typically add 4-8 percentage points to net margin."),
    ],
    'article-training-replacement.html': [
        ("How much does it cost to replace a skilled trade worker?",
         "Replacing a skilled trade worker costs 40-200% of their annual salary when you account for recruiting, onboarding, training, lost productivity during the transition, and the cost of work done incorrectly while the replacement ramps up. For a licensed HVAC tech earning $65,000, replacement cost runs $26,000-$130,000. Retention is almost always cheaper than replacement."),
        ("How do you train field service employees faster?",
         "Field service training accelerates when knowledge is embedded in systems rather than transmitted through shadowing. Process documentation that tells a new tech exactly what to do at each step of a job - with photos, checklists, and exception handling - compresses the learning curve from 3-6 months to 4-8 weeks. The documentation also travels with the company when the experienced person who created it eventually leaves."),
        ("How do you retain skilled trade employees?",
         "Skilled trade retention improves with three things: clarity about career advancement paths, reduction in administrative frustration (paperwork, unclear expectations, coordination chaos), and recognition systems that make good performance visible. Money matters, but most tradespeople leave because the job is disorganized and their skills are underutilized - fixing those drivers retains more people than raises alone."),
        ("How do AI systems reduce training time for new field employees?",
         "AI systems reduce training time by making process knowledge accessible in the field: step-by-step job procedures available on a mobile device, AI-assisted diagnostics that guide a new tech through troubleshooting, and exception handling that connects the new employee to the right escalation path without calling the office. The experienced tech's judgment gets encoded into the system; the new tech inherits the system."),
    ],
    'article-servicetitan-alternative.html': [
        ("What are the best alternatives to ServiceTitan?",
         "The best ServiceTitan alternatives for small to mid-size contractors are Jobber (field service, under 20 techs), Housecall Pro (residential service, under 10 trucks), and Service Fusion (mixed residential/commercial). For companies that have outgrown those platforms but don't need ServiceTitan's enterprise complexity, custom-built field management systems offer the specific functionality you need without the platform overhead."),
        ("How much does ServiceTitan cost per month?",
         "ServiceTitan costs $500-$1,500 per month for small to mid-size operations, plus per-tech fees and add-on module costs. Full deployment with all modules (scheduling, dispatch, marketing, reporting) and dedicated support typically runs $800-$2,000/month for companies with 10-30 technicians. The platform also requires significant setup time and ongoing configuration work that most companies underestimate."),
        ("Is ServiceTitan worth it for a small contractor?",
         "ServiceTitan is generally not worth the cost for contractors with fewer than 10-15 technicians. The platform was built for multi-location franchises with dedicated admin staff and a ServiceTitan coordinator. Small operators pay for complexity they can't use and spend hours on configuration that doesn't match their workflow. Most do better with a simpler platform or a custom-built system designed for their specific operation."),
        ("What should you look for in field service management software?",
         "The features that matter most in field service management software are: offline functionality for field techs, integration between scheduling and invoicing (no manual data re-entry), real-time job status visibility for the office, and mobile-friendly job completion forms. Everything else is secondary. Software that scores high on all four but requires significant training rarely gets used consistently."),
    ],
    'article-ai-dispatch.html': [
        ("How does AI dispatch work for field service companies?",
         "AI dispatch for field service automatically assigns jobs to technicians based on location, availability, skill match, and job history. When a new job comes in, the system identifies the best available tech, generates a route, and sends the assignment - without a dispatcher making each decision manually. Most AI dispatch systems also handle rescheduling when jobs run long or a tech calls out sick."),
        ("How much time does AI dispatch save?",
         "AI dispatch saves the average field service company 2-4 hours per day in coordination time. For owner-operators handling dispatch themselves, that's 2-4 hours of their own time returned to higher-value work. For companies with a dedicated dispatcher, AI reduces the dispatcher's role from 40 hours per week to 15-20 hours, primarily handling edge cases the system escalates."),
        ("What size company benefits from AI dispatch?",
         "Companies with 5 or more field technicians see clear ROI from AI dispatch. Below 5 techs, manual scheduling is manageable. Above 5, the number of variables - tech availability, location, job duration, skill requirements - exceeds what a person can optimize in real time. The efficiency gains compound as the company grows; at 15+ techs, manual dispatch is reliably sub-optimal."),
        ("Does AI dispatch work for emergency service calls?",
         "AI dispatch handles emergency and same-day service calls by automatically re-prioritizing the existing schedule: identifying the nearest available tech with the right skills, generating a revised route, and notifying affected customers of schedule changes. Most systems handle routine emergency dispatch faster and more accurately than a human dispatcher under the same time pressure."),
    ],
    'article-oil-gas-software.html': [
        ("What software do oil and gas field operations use?",
         "Oil and gas field operations use a combination of production management platforms, field data capture tools, maintenance management systems, and crew scheduling platforms. Most operators run 4-7 different systems that don't integrate, creating manual data reconciliation work at every handoff between field and office."),
        ("How do oil and gas companies manage field crew scheduling?",
         "Oil and gas crew scheduling is complicated by certification requirements (H2S, confined space, well control), remote locations with variable travel times, and the mix of company employees and contractor crews on the same project. Most operators manage this through a combination of spreadsheets and phone coordination. AI scheduling systems built for the sector handle certification verification and travel time automatically."),
        ("What are the biggest operational challenges in oil and gas field service?",
         "The three biggest operational challenges in oil and gas field service are: compliance documentation (safety certifications, regulatory reporting, environmental monitoring), crew coordination across remote locations without reliable connectivity, and equipment maintenance management across large asset fleets. Companies that solve these three challenges typically see 20-30% improvement in operational efficiency."),
        ("How does AI improve oil and gas operations management?",
         "AI improves oil and gas operations by automating the compliance documentation that currently requires manual data entry, optimizing crew deployment across production areas based on real-time priorities, and predicting equipment maintenance needs from operational data rather than fixed maintenance schedules. The highest-value application in most O&G operations is maintenance prediction - preventing production loss from equipment failure."),
    ],
    'article-predictive-maintenance.html': [
        ("What is predictive maintenance and how does it work?",
         "Predictive maintenance uses equipment sensor data, historical maintenance records, and usage patterns to identify when a machine is likely to fail before it does. Unlike preventive maintenance (fixed-interval service) or reactive maintenance (fix it when it breaks), predictive maintenance targets service to the specific equipment showing early failure indicators - reducing both unplanned downtime and unnecessary maintenance work."),
        ("How much does predictive maintenance save compared to reactive maintenance?",
         "Predictive maintenance typically reduces maintenance costs by 25-30% compared to reactive maintenance and by 8-12% compared to preventive maintenance. More importantly, it reduces unplanned downtime by 70-75%. For a field service company where equipment availability directly drives revenue, unplanned downtime costing $15,000-$40,000 per incident makes a $300-$800/month maintenance system pay for itself in the first prevented failure."),
        ("How do small companies implement predictive maintenance?",
         "Small companies implement predictive maintenance without complex sensor infrastructure by starting with systematic symptom logging: recording unusual sounds, performance changes, and operator-reported anomalies against specific equipment records. AI analysis of these logs against historical failure patterns generates service alerts before failure occurs. The barrier to entry is lower than most small operators assume - you don't need IoT sensors to start."),
        ("Which equipment benefits most from predictive maintenance?",
         "Equipment that benefits most from predictive maintenance has three characteristics: high replacement or repair cost, high revenue impact when it's down, and failure patterns that show observable warning signs. In field service operations, this typically includes HVAC compressors, diesel generators, excavators and heavy construction equipment, and pumps and compressors in oil and gas operations. Vehicles with telematics data are also high-value candidates."),
    ],
    'article-online-launch-burnout.html': [
        ("Why do online business launches cause burnout?",
         "Online business launches cause burnout because most of the effort goes into the launch moment rather than the systems that sustain what comes after. A six-week sprint to launch generates leads and attention, but if the follow-up, onboarding, and delivery systems aren't built before launch, the founder spends the post-launch period manually handling everything the system should be doing automatically."),
        ("How do you build a sustainable online launch system?",
         "A sustainable launch system requires four automated sequences running before you go live: a lead nurture sequence that moves prospects from awareness to decision without manual follow-up, an onboarding sequence that delivers the initial experience without founder involvement, a check-in sequence that identifies at-risk customers early, and a referral request sequence that activates satisfied customers. Build these first; launch second."),
        ("What should be automated before an online product launch?",
         "Before an online product launch, automate: email follow-up sequences for every lead source, payment processing and access delivery, onboarding steps that don't require customization, customer support FAQs (at minimum), and performance reporting. The goal is to ensure that the first 72 hours after launch - when volume peaks - don't require the founder to be manually involved in every transaction."),
        ("How do you recover from a launch that burned you out?",
         "Recovering from a burnout launch means building the infrastructure you skipped the first time: map every task you did manually during and after launch, identify which ones repeat with every new customer, and build the systems that handle those tasks automatically. The second launch from that foundation is a completely different experience - and the business that emerges from it is actually scalable."),
    ],
    'article-online-lead-followup.html': [
        ("How fast should you follow up with online leads?",
         "The data on lead follow-up speed is consistent: response within 5 minutes of an inquiry is 21 times more likely to result in conversion than response within 30 minutes. By the one-hour mark, conversion rates drop by 80% compared to the 5-minute window. Most companies respond in hours, not minutes, because follow-up depends on a person checking their inbox. Automated immediate response changes the economics entirely."),
        ("What should an automated lead follow-up sequence include?",
         "An effective automated lead follow-up sequence includes: an immediate response acknowledging the inquiry (within 1 minute), a follow-up with relevant information 2-4 hours later, a check-in on day 3 if no response, a final reach-out on day 7, and a long-term nurture sequence for non-responders. Most companies have none of this. Adding even the first two touchpoints typically doubles close rates from inbound leads."),
        ("Why do businesses lose leads they could have converted?",
         "Businesses lose convertible leads for three reasons: no immediate response, follow-up that stops after one or two attempts, and generic messaging that doesn't connect to the lead's specific situation or urgency. Leads with real buying intent don't wait - they send 3-5 inquiries simultaneously and buy from the first company that responds with something relevant."),
        ("How do you build a lead follow-up system for a small business?",
         "Building a lead follow-up system starts with mapping your current lead sources (website form, phone, referral, etc.) and the first message you want to send for each. Build the immediate response first - a simple email or text that goes out within 60 seconds of a form submission. Then add the day-3 and day-7 touchpoints. Most businesses see a 40-80% increase in lead conversion from adding these three touchpoints alone."),
    ],
}

def json_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

def build_jsonld(pairs):
    entities = []
    for q, a in pairs:
        entities.append(
            '{"@type":"Question","name":' + json_str(q) +
            ',"acceptedAnswer":{"@type":"Answer","text":' + json_str(a) + '}}'
        )
    return (
        '<script type="application/ld+json">\n'
        '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":['
        + ','.join(entities) +
        ']}\n</script>'
    )

def build_visible_faq(pairs):
    items = ''
    for q, a in pairs:
        items += f'''    <div class="faq-item">
      <div class="faq-q">{q}</div>
      <div class="faq-a">{a}</div>
    </div>\n'''
    return (
        '<div class="container-article">\n'
        '  <div class="article-faq">\n'
        '    <h2 class="faq-heading">Common Questions</h2>\n'
        + items +
        '  </div>\n</div>\n'
    )

count = 0
for filename, pairs in ARTICLES.items():
    with open(filename, encoding='utf-8', errors='ignore') as f:
        content = f.read()

    if 'article-faq' in content:
        print(f'SKIP (already has FAQ): {filename}')
        continue

    modified = False

    # Add CSS before </style>
    if FAQ_CSS not in content:
        content = content.replace('</style>', FAQ_CSS + '\n</style>', 1)
        modified = True

    # Add JSON-LD before </head> if not already there
    if '"FAQPage"' not in content:
        jsonld = build_jsonld(pairs)
        content = content.replace('</head>', jsonld + '\n</head>', 1)
        modified = True

    # Add visible FAQ before <div class="read-next">
    visible = build_visible_faq(pairs)
    if '<div class="read-next">' in content:
        content = content.replace('<div class="read-next">', visible + '<div class="read-next">', 1)
    elif '<div class="read-next ' in content:
        # handle extra class
        idx = content.find('<div class="read-next')
        content = content[:idx] + visible + content[idx:]
    modified = True

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)

    count += 1
    print(f'Updated: {filename} ({len(pairs)} Q&As)')

print(f'\nTotal updated: {count}')

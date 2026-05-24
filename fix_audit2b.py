"""
Fix 7 articles that have FAQ CSS but no FAQ HTML or JSON-LD.
"""
import os, re
os.chdir(r'C:\Users\mialo\tmi-landing-1')

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
        items += f'    <div class="faq-item">\n      <div class="faq-q">{q}</div>\n      <div class="faq-a">{a}</div>\n    </div>\n'
    return (
        '<div class="container-article">\n'
        '  <div class="article-faq">\n'
        '    <h2 class="faq-heading">Common Questions</h2>\n'
        + items +
        '  </div>\n</div>\n'
    )

ARTICLES = {
    'article-backlog-cash-timing.html': [
        ("What is the difference between backlog and cash flow for contractors?",
         "Backlog is the value of work you've sold but not yet completed. Cash flow is the money actually moving through your bank account. Contractors with full backlogs frequently have cash flow problems because the work is contracted but not yet billed, the billing is sent but not yet paid, or the payment is received but retainage is held. Backlog tells you about future revenue; it tells you nothing about current cash."),
        ("Why do profitable construction companies run out of cash?",
         "Profitable construction companies run out of cash because profit is earned over the life of a project but costs hit before revenue. Materials need to be purchased, crews need to be paid, and equipment needs to be rented before a project generates invoices. When multiple large projects start simultaneously, the cash requirement peaks before the first invoice cycle is complete. This is a timing problem, not a profitability problem."),
        ("How do contractors manage cash flow gaps?",
         "Managing construction cash flow gaps requires three things: an accurate 90-day cash projection that accounts for invoice timing and payment terms, a clear view of receivables by age, and a line of credit sized to cover peak negative cash positions. Most contractors manage cash reactively - checking the bank balance when a payment is due. Proactive cash management requires a system that projects outflows against expected inflows 30-60 days ahead."),
        ("How does AI help contractors forecast cash flow?",
         "AI cash flow forecasting for contractors uses job schedules, historical payment timing by customer type, and current receivables aging to project 30-90 day cash positions. The practical benefit is knowing 45 days ahead that a cash shortfall is coming - giving you time to accelerate invoicing, negotiate a payment advance, or draw on a credit line before the shortage hits payroll."),
    ],
    'article-best-ai-hvac-software.html': [
        ("What is the best AI software for HVAC companies?",
         "The best AI software for HVAC companies automates the three workflows that drive the most overhead: scheduling and dispatch (routing techs by location, skill, and equipment), preventive maintenance reminders (triggering service calls before equipment fails), and billing (generating invoices from completed job data the same day). ServiceTitan, Jobber, and purpose-built HVAC AI systems each approach these differently - the right choice depends on fleet size and whether your techs can use it in the field without WiFi."),
        ("How does AI dispatch work for HVAC companies?",
         "AI dispatch for HVAC companies automatically routes service calls to the nearest available tech with the right EPA certifications for the job, adjusting in real time as calls come in and jobs run long. The practical result is 20-35% less drive time per tech per day and elimination of the daily scheduling calls that take the owner or dispatcher's morning. Most HVAC AI dispatch systems also handle emergency call prioritization automatically."),
        ("How much does HVAC software with AI features cost?",
         "HVAC software with AI scheduling and automation features runs from $200/month (Jobber's mid-tier) to $800-$1,500/month (ServiceTitan). Custom-built HVAC management systems designed around a specific company's workflow typically run $1,500-$2,500/month and replace the coordination overhead of 1-2 office staff. Break-even against coordinator salary is typically 4-8 months."),
        ("Can small HVAC companies afford AI software?",
         "HVAC companies with 3 or more technicians can afford AI software and see positive ROI. The math is straightforward: if AI dispatch saves 1.5 hours of coordination time per day at $50/hour opportunity cost, that's $19,500 per year - enough to justify $400-$800/month in software. The ROI increases with fleet size. The company that can't afford it is usually the 1-2 tech operation where manual scheduling is still manageable."),
    ],
    'article-best-guy-quit.html': [
        ("How do you retain knowledge when a key employee leaves?",
         "Retaining institutional knowledge when a key employee leaves requires capturing it before they go - not after. The knowledge that matters most is process knowledge: how jobs get scheduled, how problems get escalated, how customers get handled, how the system gets interpreted. Documentation alone doesn't capture this. Systems that embed the logic into workflows preserve it automatically."),
        ("What happens to a business when a key person leaves?",
         "When a key person leaves a small service business, the typical impact is: a 20-40% slowdown in the workflows they owned, 3-6 months of degraded performance while a replacement learns the role, and permanent loss of the tacit knowledge (relationships, shortcuts, judgment calls) that never got documented. For owner-operated businesses, the risk is concentration - one person holds the keys to the operation."),
        ("How do you document processes before an employee leaves?",
         "Process documentation that actually gets used has three characteristics: it's specific enough to follow without prior context, it's stored where the work happens (not in a separate folder), and it gets updated as processes change. The fastest way to capture a key employee's knowledge is to record them walking through their daily decisions and turn those recordings into step-by-step workflows."),
        ("How do AI systems help with knowledge retention?",
         "AI systems support knowledge retention by embedding decision logic into workflows rather than relying on people to remember it. When the system routes a job, flags an exception, or generates a document, the logic behind those actions is preserved in the system - not in someone's head. Crew transitions become faster because the new person inherits a system, not a blank slate."),
    ],
    'article-power-ai-projects-crew-safety.html': [
        ("How do AI systems improve safety on power generation job sites?",
         "AI systems improve power generation job site safety by automating the tracking of hazard clearances, certifications, and safety protocols that currently depend on manual verification. When a crew member's confined space certification is expired or a lockout/tagout procedure isn't logged, an AI system flags it before work begins - not after an incident."),
        ("What crew readiness data matters most for high-voltage projects?",
         "The crew readiness data that matters most for high-voltage and power generation projects includes: certification currency (NFPA 70E, arc flash, confined space), equipment inspection status, site-specific hazard briefing completion, and emergency contact and medical information. Most companies track these in separate systems or spreadsheets - a single integrated view is what makes pre-job verification fast enough to actually do every time."),
        ("How do you manage crew qualifications on a large data center or power project?",
         "Managing crew qualifications on large power or data center projects requires a database that tracks individual certifications, expiration dates, and project-specific training requirements, then matches qualified personnel to job assignments. Manual management of this at scale - projects with 50-200+ crew members - leads to assignment errors and compliance gaps. Automated qualification matching eliminates both."),
        ("What is the cost of a safety incident on a power generation project?",
         "A recordable safety incident on a power generation or data center project costs $40,000-$180,000 in direct costs (medical, OSHA penalties, incident investigation, lost time). Indirect costs - project delays, insurance increases, subcontractor relationship damage, potential debarment from future bids - typically run 3-5x the direct cost. The ROI on systems that prevent incidents is calculable and consistently positive."),
    ],
    'article-revenue-leakage.html': [
        ("What is revenue leakage in field service?",
         "Revenue leakage in field service is the gap between the work you do and the work you invoice. It includes jobs completed but never invoiced, change orders done but not billed, materials used but not captured on the invoice, and time spent on-site beyond the quoted hours. Most companies lose 8-15% of revenue this way without realizing it because the leak is spread across dozens of small unbilled items."),
        ("How do field service companies lose revenue without knowing it?",
         "The most common invisible revenue leaks are: work done during a service call that wasn't on the original order, parts installed that were logged on paper and never entered in the system, overtime hours that didn't get billed as premium, and callbacks that were charged at regular rate when the contract allowed for warranty exclusions. Each is small. Together they add up to real margin erosion."),
        ("How do you find revenue leakage in a service business?",
         "The fastest way to find revenue leakage is to compare jobs closed in your scheduling system against invoices sent in your billing system for the same period. Any job with a closed status and no matching invoice is a leak. Run this report monthly for 90 days and you'll identify your specific patterns - usually 3-5 recurring sources that account for 80% of the total loss."),
        ("How much revenue do service companies lose to billing gaps?",
         "Field service industry benchmarks show average revenue leakage of 8-15% for companies without automated billing workflows. For a company with $3M in revenue, that's $240,000-$450,000 per year in unbilled or under-billed work. Companies that implement same-day invoicing tied directly to job completion data typically recover 60-80% of that leakage within 90 days."),
    ],
    'article-scaling-trap.html': [
        ("What is the scaling trap for service businesses?",
         "The scaling trap is when adding revenue requires adding proportional headcount and coordination overhead, so margin stays flat or shrinks as the business grows. A company that needs one coordinator per 8 trucks and one project manager per 10 jobs cannot scale profitably without first building systems that break the linear relationship between revenue growth and labor growth."),
        ("Why do service companies struggle to scale past $3M?",
         "The $3-5M revenue wall in service businesses is almost always a systems problem. Below $3M, the owner can hold the operation together personally. Above $3M, the number of concurrent jobs, crews, and customer relationships exceeds what any individual can track. Companies that don't build operational infrastructure at this stage find that revenue grows but profit doesn't."),
        ("How do you scale a field service company without losing margin?",
         "Scaling field service without losing margin requires automating the coordination work before you need to hire for it: dispatch, scheduling, invoicing, follow-up, and reporting. Companies that build systems first can grow revenue 30-50% without adding headcount in those functions. Companies that hire first find that each coordinator and project manager creates their own category of coordination overhead."),
        ("What systems does a field service company need before scaling?",
         "The four systems a field service company needs before scaling are: (1) automated dispatch that routes jobs without a human scheduler, (2) field data capture that generates invoices directly from job completion, (3) a job status system that gives the owner visibility without requiring calls, and (4) a customer communication system that handles follow-up automatically. Build these at $1.5-2M and they pay back immediately; try to install them at $5M and you're retrofitting while running."),
    ],
    'article-subcontractors.html': [
        ("How do general contractors manage subcontractors effectively?",
         "Effective subcontractor management requires clear scope documentation before the work starts, regular status check-ins that don't depend on the sub initiating contact, and a single system for tracking deliverables and invoices. Most GC-subcontractor friction comes from ambiguous scope and delayed communication - both are systems problems, not relationship problems."),
        ("What causes subcontractor disputes in construction?",
         "Most subcontractor disputes trace back to one of three causes: scope ambiguity in the original contract, unapproved changes done without written authorization, or payment delays that weren't clearly addressed in the agreement. Contracts that define change order procedures, payment timing, and dispute resolution eliminate most disputes before they start."),
        ("How do you track subcontractor work on a construction project?",
         "Tracking subcontractor work requires a system that captures milestone completion (not just start/end dates), documents deficiencies before the sub leaves the site, and ties payment releases to verified completion. Most GCs track this through a combination of site visits, emails, and phone calls. Digital milestone tracking with photo documentation reduces disputes and speeds lien releases."),
        ("Can AI help manage subcontractor coordination?",
         "AI can improve subcontractor coordination by automating the status update requests that currently require phone calls, flagging when a sub's schedule is creating a downstream conflict, and generating payment release requests when completion milestones are verified. The reduction in coordination overhead is typically 30-50% for GCs managing 5+ active subcontractors simultaneously."),
    ],
}

count = 0
for filename, pairs in ARTICLES.items():
    with open(filename, encoding='utf-8', errors='ignore') as f:
        c = f.read()

    modified = False

    # Add JSON-LD before </head>
    if '"FAQPage"' not in c:
        jsonld = build_jsonld(pairs)
        c = c.replace('</head>', jsonld + '\n</head>', 1)
        modified = True

    # Check if there's an actual article-faq HTML element (not just CSS)
    # The CSS definition contains "article-faq{" but the HTML element is class="article-faq"
    has_faq_html = 'class="article-faq"' in c
    if not has_faq_html:
        visible = build_visible_faq(pairs)
        if '<div class="read-next">' in c:
            c = c.replace('<div class="read-next">', visible + '<div class="read-next">', 1)
            modified = True

    if modified:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(c)
        count += 1
        has_new_json = '"FAQPage"' in c
        has_new_html = 'class="article-faq"' in c
        print(f'Updated {filename}: JSON-LD={has_new_json}, HTML={has_new_html}')
    else:
        print(f'SKIP (already complete): {filename}')

print(f'\nTotal updated: {count}')

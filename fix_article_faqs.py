import re
import os

os.chdir(r'C:\Users\mialo\tmi-landing-1')

ARTICLE_FAQ_CSS = """
  .article-faq{padding:48px 0 0;border-top:1px solid var(--line);margin-top:48px;}
  .article-faq h2{font-family:var(--serif);font-size:clamp(26px,2.5vw,36px);font-weight:400;letter-spacing:-0.02em;line-height:1.1;color:var(--ink);margin:0 0 40px;}
  .article-faq .faq-item{border-top:1px solid var(--line);padding:24px 0;}
  .article-faq .faq-item:first-of-type{border-top:none;padding-top:0;}
  .article-faq .faq-q{font-family:var(--serif);font-size:clamp(17px,1.5vw,20px);font-weight:400;letter-spacing:-0.01em;line-height:1.3;color:var(--ink);margin:0 0 12px;}
  .article-faq .faq-a{font-family:var(--sans);font-size:15px;line-height:1.7;color:var(--ink-2);margin:0;}
"""

# FAQs for commercial articles that lack FAQPage JSON-LD
COMMERCIAL_FAQS = {
    'article-best-ai-roofing-software.html': {
        'faqs': [
            ("What is the best AI software for roofing companies?",
             "The best AI for roofing companies is a custom-built system configured around how your crews estimate, schedule, and close jobs. The highest-leverage applications are automated estimating from aerial imagery, storm damage assessment, crew scheduling, and invoice automation that captures material and labor costs as work happens."),
            ("How does AI help roofing contractors win more jobs?",
             "AI helps roofing contractors win more jobs by compressing the estimate-to-proposal cycle. Systems that pull aerial measurements, generate material takeoffs automatically, and produce customer-ready proposals cut the time from lead to signed contract by 60-80 percent - which matters most during storm season when every hour of delay means lost jobs."),
            ("What does AI cost for a roofing company?",
             "AI implementation for a roofing company typically costs $3,000-$8,000 per month on retainer plus a $15,000-$40,000 initial build. Most roofing operations recover that within the first year through estimating accuracy gains and invoice completion - capturing materials that previously went unbilled adds 8-15 percent to realized margins."),
            ("Can AI replace roofing estimators?",
             "AI does not replace estimators - it eliminates the time they spend on measurements, takeoffs, and document assembly. A roofing estimator using AI can produce three to four times more proposals in the same hours, with fewer errors on material quantities. The judgment calls on scope, subcontractor coordination, and customer relationships stay human.")
        ]
    },
    'article-best-ai-plumbing-software.html': {
        'faqs': [
            ("What is the best AI software for plumbing companies?",
             "The best AI for plumbing companies handles the three biggest margin leaks: dispatch efficiency (getting the right tech to the right job), parts and materials capture (logging what gets used so it gets billed), and invoice completion (ensuring every billable item is on the invoice before the tech leaves). Companies that fix all three typically recover 12-18 percent in gross margin."),
            ("How does AI dispatching work for plumbing companies?",
             "AI dispatch for plumbing companies matches incoming jobs to technicians based on location, skill set, parts on truck, and current schedule - then routes around real-time traffic. The system updates continuously throughout the day as jobs run long or short. Most plumbing operations see 2-3 more completed jobs per truck per week after switching to AI dispatch."),
            ("Does AI software work for small plumbing companies?",
             "AI systems work well for plumbing companies with 5 or more trucks. Below that threshold, the volume of jobs does not generate enough data for meaningful pattern recognition, and the manual overhead of adoption outweighs the gains. At 5-10 trucks, the ROI calculation becomes compelling, especially for companies struggling with scheduling and invoice accuracy."),
            ("What plumbing-specific problems does AI solve?",
             "AI solves the plumbing industry's most common revenue problems: after-hours emergency dispatch without an expensive call center, parts usage that never makes it onto the invoice, callbacks from incomplete diagnosis, and job costing that tells you which job types actually make money versus which ones look profitable on the surface.")
        ]
    },
    'article-ai-dispatch-software.html': {
        'faqs': [
            ("What is AI dispatch software for field service?",
             "AI dispatch software automatically assigns incoming service calls to the right technician based on location, skills, parts availability, and current schedule - then re-optimizes routes throughout the day as conditions change. Unlike manual dispatching or basic scheduling tools, AI dispatch treats the entire day's workload as one optimization problem rather than a sequence of individual decisions."),
            ("How much does AI dispatch software cost?",
             "AI dispatch software built for field service operations costs $2,000-$5,000 per month for a custom-configured system versus $200-$800 per month for standard off-the-shelf schedulers. The difference is outcome: custom systems are built around your specific job types, truck configurations, and territory - and typically add 2-4 jobs per truck per week, which more than covers the cost."),
            ("What is the ROI on AI dispatching?",
             "The ROI on AI dispatching typically comes from three sources: more completed jobs per truck (driving $800-$2,400 per truck per week in additional revenue), reduced fuel and drive time (saving $150-$400 per truck per week), and fewer dispatching errors that cause callbacks or missed windows. Most operations achieve full cost recovery within 3-6 months."),
            ("Can AI dispatch software replace a human dispatcher?",
             "AI dispatch software handles the routing and optimization work that consumed 60-70 percent of a dispatcher's time. The human dispatcher shifts to exceptions, customer communication, and escalations - or one dispatcher can effectively manage twice the fleet size. Companies with dedicated dispatch teams rarely eliminate the role; they reallocate it toward higher-value coordination work.")
        ]
    },
    'article-ai-invoicing-automation.html': {
        'faqs': [
            ("What is AI invoicing automation for field service?",
             "AI invoicing automation captures billable work as it happens in the field and converts it to complete, accurate invoices without manual data entry. This means parts logged on the job site appear on the invoice, labor time tracked in the field transfers automatically, and completed work orders generate customer-ready invoices before the tech drives away."),
            ("How much revenue do companies lose to invoicing errors?",
             "Field service companies typically lose 8-15 percent of potential revenue to invoicing gaps - parts that get installed but not captured, labor that exceeds the quoted time but does not make it onto the invoice, and markup on materials that gets left off. On a $3 million operation, that is $240,000 to $450,000 per year in revenue that goes unrecovered."),
            ("How does AI improve invoice accuracy?",
             "AI improves invoice accuracy by eliminating the step where a tech tries to remember everything used on a job while sitting in a parking lot. The system prompts for parts as they are scanned, tracks job time automatically, flags jobs where time or materials exceed the estimate so the tech can address it on-site, and generates the invoice from structured data rather than memory."),
            ("Does AI invoicing work with existing accounting software?",
             "AI invoicing systems are built to integrate with existing accounting software - QuickBooks, Sage, NetSuite, and most field service management platforms. The integration layer syncs completed invoices, payment records, and job costs bidirectionally. Implementation typically takes 4-8 weeks to configure the integration and configure the invoice logic to match how your operation prices work.")
        ]
    },
    'article-servicetitan-vs-custom-ai.html': {
        'faqs': [
            ("What is the difference between ServiceTitan and custom AI?",
             "ServiceTitan is a field service management platform - software for scheduling, dispatch, and invoicing. Custom AI is a purpose-built system configured around how your specific operation makes money. ServiceTitan organizes existing workflows. Custom AI identifies where those workflows leak revenue and fixes those specific points, including integrations ServiceTitan does not offer."),
            ("Why do companies leave ServiceTitan?",
             "Companies leave ServiceTitan primarily for three reasons: the contract and pricing structure, the gap between what the software can do and what their specific operation needs, and the realization that a general-purpose platform requires significant customization to match their workflow. Most ServiceTitan replacements are companies who outgrew the platform's assumptions about how field service should work."),
            ("Is custom AI more expensive than ServiceTitan?",
             "Custom AI systems typically cost $3,000-$8,000 per month versus ServiceTitan's $500-$2,000 per month for equivalent company sizes. The cost difference is real. The question is whether the outcome difference justifies it - most operations that switch report recovering 10-20 percent in gross margin from workflow improvements that a general platform could not provide."),
            ("When should a company choose custom AI over ServiceTitan?",
             "Custom AI makes sense over ServiceTitan when a company has specific workflow requirements that the platform does not accommodate, when they are running revenue above $2 million per year and margin improvements compound meaningfully, or when they need deep integrations with equipment systems, supplier catalogs, or accounting platforms that require custom development work.")
        ]
    },
    'article-ai-implementation-cost.html': {
        'faqs': [
            ("How much does AI implementation cost for a field service company?",
             "AI implementation for a field service company costs $15,000-$60,000 for the initial build plus $2,000-$8,000 per month on retainer, depending on scope. The build covers system configuration, integrations, and workflow design. The retainer covers ongoing model tuning, maintenance, and expansion as the business evolves. Most operations achieve positive ROI within 6-12 months."),
            ("What drives up the cost of AI implementation?",
             "The three biggest cost drivers in AI implementation are integration complexity (connecting to existing systems), data quality (cleaning historical data before training), and scope creep during build. Projects with clean data and clear requirements come in at the lower end. Projects that require extensive legacy system integrations or have poorly structured data run 40-60 percent higher."),
            ("What is the ROI on AI for a field service operation?",
             "Field service operations typically see AI ROI from four sources: margin recovery from invoice accuracy (6-12 percent), labor efficiency from better scheduling (8-14 percent), reduced administrative overhead (30-50 percent reduction in office hours), and customer retention improvements from faster response times. Combined, the lift on a $3 million operation is typically $300,000-$600,000 in annual improvement."),
            ("How long does AI implementation take?",
             "AI implementation for a field service company takes 8-16 weeks from contract to live system. The phases are: requirements and workflow mapping (2-3 weeks), system build and integration (4-8 weeks), testing and training (2-3 weeks), and rollout (1-2 weeks). More complex operations with multiple locations or custom integrations typically run 14-20 weeks.")
        ]
    },
    'article-best-ai-manufacturing-software.html': {
        'faqs': [
            ("What is the best AI software for manufacturing companies?",
             "The best AI for manufacturing companies addresses the three highest-cost failure modes: unplanned equipment downtime (predictive maintenance), quality defects that make it to final inspection (anomaly detection), and shift handoff gaps where context about equipment conditions gets lost between crews. These three areas account for 70-80 percent of recoverable manufacturing losses."),
            ("How does AI predictive maintenance work?",
             "AI predictive maintenance monitors sensor data - vibration, temperature, pressure, current draw - and identifies patterns that precede equipment failure before they become failures. The system flags machines whose signatures are trending toward a known failure mode and alerts maintenance before a breakdown occurs. Most facilities see a 40-60 percent reduction in unplanned downtime within the first year."),
            ("What does AI cost for a manufacturing facility?",
             "AI implementation for a manufacturing facility typically costs $25,000-$80,000 for the initial build plus $3,000-$10,000 per month depending on the number of machines being monitored and the complexity of integrations with existing MES or ERP systems. Operations running three shifts on capital-intensive equipment recover the investment quickly - one prevented major failure often covers multiple years of system cost."),
            ("Can small manufacturers benefit from AI?",
             "Manufacturers with 20 or more production employees and capital equipment valued above $500,000 typically have enough at stake to justify AI investment. Below that threshold, the ROI math is harder. Above it, the combination of predictive maintenance and quality monitoring usually identifies losses larger than the system cost within the first 90 days of operation.")
        ]
    },
    'article-best-ai-fleet-management.html': {
        'faqs': [
            ("What is the best AI software for fleet management?",
             "The best AI for fleet management goes beyond GPS tracking to operational intelligence: which vehicles need maintenance before they fail, which routes generate the most revenue per mile, which drivers are burning fuel unnecessarily, and which jobs are worth dispatching given current fleet position and job profitability. Tracking tells you where assets are. AI tells you what to do about it."),
            ("How does AI reduce fleet operating costs?",
             "AI reduces fleet operating costs through three main levers: predictive maintenance that prevents costly roadside failures (saving $8,000-$25,000 per avoided breakdown), route optimization that cuts drive time and fuel (saving 15-22 percent on fuel), and dispatch intelligence that assigns jobs based on profitability and proximity rather than availability alone. Most fleets see 18-28 percent total operating cost reduction."),
            ("What is the difference between GPS tracking and AI fleet management?",
             "GPS tracking shows vehicle location and records mileage and speed. AI fleet management uses that data plus job history, maintenance records, fuel consumption, and driver behavior to make recommendations and predictions. GPS tells you a truck idled for 45 minutes. AI tells you why, whether that driver consistently does it, and what it costs you annually across the fleet."),
            ("How many vehicles do you need to justify AI fleet management?",
             "AI fleet management delivers measurable ROI starting at 8-10 vehicles. Below that number, the cost of a custom system typically exceeds the gains. At 10-15 vehicles, the ROI is clear but narrow. At 20 or more vehicles, the savings from predictive maintenance and route optimization alone typically cover the full system cost within 4-6 months.")
        ]
    },
    'article-best-ai-hvac-software.html': {
        'faqs': [
            ("What is the best AI software for HVAC companies?",
             "The best AI for HVAC companies handles the operations that drain margin: dispatch routing that minimizes drive time between calls, parts usage capture so everything installed shows up on the invoice, maintenance agreement tracking that surfaces renewal opportunities automatically, and job costing that shows which service types and which technicians are actually profitable."),
            ("How does AI dispatching improve HVAC operations?",
             "AI dispatch for HVAC companies optimizes technician routing based on location, parts on truck, call priority, and skill set - then adjusts dynamically as calls come in and jobs run long. Most HVAC operators see 2-3 additional completed service calls per technician per day after implementing AI dispatch, which compounds significantly across a fleet of 8-20 trucks."),
            ("What specific problems does AI solve for HVAC contractors?",
             "AI solves HVAC's most persistent revenue problems: maintenance agreements that lapse without renewal outreach, parts installed during a call that miss the invoice, callbacks caused by incomplete diagnosis, technicians spending 40 minutes at the end of each day doing paperwork, and owners who cannot see job profitability by customer, equipment type, or service category without pulling reports manually."),
            ("Does AI HVAC software work with existing systems?",
             "AI systems for HVAC companies integrate with ServiceTitan, Jobber, QuickBooks, and most field service platforms. The integration captures data from existing systems rather than replacing them. Most HVAC contractors keep their current dispatch and invoicing platform during an initial phase, with the AI layer adding intelligence on top before deciding whether to migrate fully.")
        ]
    }
}

def build_faq_json_ld(faqs, page_url):
    entities = []
    for q, a in faqs:
        entities.append(
            '{"@type":"Question","name":' + json_str(q) + ',"acceptedAnswer":{"@type":"Answer","text":' + json_str(a) + '}}'
        )
    return '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[' + ','.join(entities) + ']}'

def json_str(s):
    escaped = s.replace('\\', '\\\\').replace('"', '\\"')
    return '"' + escaped + '"'

def extract_faqs_from_jsonld(content):
    # Find FAQPage block - may be standalone or part of a multi-schema script block
    faq_match = re.search(
        r'"@type"\s*:\s*"FAQPage"\s*,\s*"mainEntity"\s*:\s*\[(.+?)\]\s*\}',
        content, re.DOTALL
    )
    if not faq_match:
        return []

    main_entity = faq_match.group(1)
    qa_pairs = []

    # Extract Q&As - handle both single and double quoted values
    # Also handle apostrophes in text by using a more permissive pattern
    for q_match in re.finditer(
        r'"name"\s*:\s*(["\'])(.+?)\1\s*,\s*"acceptedAnswer"\s*:\s*\{[^{]*?"text"\s*:\s*(["\'])(.+?)\3\s*\}',
        main_entity, re.DOTALL
    ):
        name = q_match.group(2).strip()
        text = q_match.group(4).strip()
        if name and text:
            qa_pairs.append((name, text))

    return qa_pairs

def build_visible_faq_html(qa_pairs):
    items = []
    for q, a in qa_pairs:
        items.append(f'      <div class="faq-item">\n        <h3 class="faq-q">{q}</h3>\n        <p class="faq-a">{a}</p>\n      </div>')
    return (
        '\n<div class="container-article">\n'
        '  <div class="article-faq reveal">\n'
        '    <h2>Frequently Asked Questions</h2>\n'
        + '\n'.join(items) +
        '\n  </div>\n</div>\n\n'
    )

count_commercial = 0
count_industry = 0

# --- Handle commercial articles (add JSON-LD + visible HTML) ---
for filename, data in COMMERCIAL_FAQS.items():
    if not os.path.exists(filename):
        print(f"NOT FOUND: {filename}")
        continue

    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'faq-item' in content:
        print(f"Already has FAQ: {filename}")
        continue

    faqs = data['faqs']

    # Add FAQPage JSON-LD after existing Article JSON-LD
    faq_jsonld = '<script type="application/ld+json">\n' + build_faq_json_ld(faqs, '') + '\n</script>\n'
    # Insert after existing ld+json block
    content = re.sub(
        r'(</script>\n)(\s*<style>)',
        r'\1' + faq_jsonld + r'\2',
        content, count=1
    )

    # Add CSS
    if '.article-faq' not in content:
        content = content.replace('</style>', ARTICLE_FAQ_CSS + '</style>', 1)

    # Build visible FAQ HTML
    faq_html = build_visible_faq_html(faqs)

    # Insert before read-next div
    read_next_match = re.search(r'\n<div class="read-next">', content)
    if read_next_match:
        pos = read_next_match.start()
        content = content[:pos] + '\n' + faq_html + content[pos:]
    else:
        # Fallback: before footer
        footer_match = re.search(r'\n<footer', content)
        if footer_match:
            pos = footer_match.start()
            content = content[:pos] + '\n' + faq_html + content[pos:]

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    count_commercial += 1
    print(f"Commercial FAQ added ({len(faqs)} Q&As): {filename}")

# --- Handle industry articles (visible HTML from existing JSON-LD) ---
industry_articles = [
    f for f in os.listdir('.')
    if f.startswith('article-') and f.endswith('.html')
    and f not in COMMERCIAL_FAQS
]

for filename in sorted(industry_articles):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'faq-item' in content:
        continue

    if '"@type":"FAQPage"' not in content:
        continue

    qa_pairs = extract_faqs_from_jsonld(content)
    if not qa_pairs:
        print(f"No FAQ extracted: {filename}")
        continue

    # Add CSS
    if '.article-faq' not in content:
        content = content.replace('</style>', ARTICLE_FAQ_CSS + '</style>', 1)

    faq_html = build_visible_faq_html(qa_pairs)

    # Insert before read-next div
    read_next_match = re.search(r'\n<div class="read-next">', content)
    if read_next_match:
        pos = read_next_match.start()
        content = content[:pos] + '\n' + faq_html + content[pos:]
    else:
        footer_match = re.search(r'\n<footer', content)
        if footer_match:
            pos = footer_match.start()
            content = content[:pos] + '\n' + faq_html + content[pos:]

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    count_industry += 1
    print(f"Industry FAQ added ({len(qa_pairs)} Q&As): {filename}")

print(f"\nCommercial articles: {count_commercial}")
print(f"Industry articles: {count_industry}")
print(f"Total: {count_commercial + count_industry}")

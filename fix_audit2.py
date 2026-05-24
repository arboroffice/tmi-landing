"""
Fix items from second audit:
1. Add canonical to partners.html
2. Add FAQPage JSON-LD to 7 articles that have visible FAQ HTML but no schema
3. Add FAQPage JSON-LD + visible FAQ to 3 articles missing both
"""
import os, re
os.chdir(r'C:\Users\mialo\tmi-landing-1')

FAQ_CSS = """  .article-faq{padding:56px 0 16px;border-top:1px solid var(--line);}
  .article-faq .faq-heading{font-family:var(--sans);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--muted);margin-bottom:32px;}
  .article-faq .faq-item{border-top:1px solid var(--line);padding:24px 0;}
  .article-faq .faq-item:first-of-type{border-top:none;}
  .article-faq .faq-q{font-family:var(--serif);font-size:20px;font-weight:400;color:var(--ink);margin-bottom:12px;line-height:1.3;}
  .article-faq .faq-a{font-family:var(--serif);font-size:17px;color:var(--ink-2);line-height:1.65;}"""

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

def extract_faq_pairs(content):
    """Extract Q&A pairs from existing article-faq HTML."""
    pairs = []
    items = re.findall(r'class="faq-q">(.*?)</div>\s*<div class="faq-a">(.*?)</div>', content, re.DOTALL)
    for q, a in items:
        q = re.sub(r'<[^>]+>', '', q).strip()
        a = re.sub(r'<[^>]+>', '', a).strip()
        if q and a:
            pairs.append((q, a))
    return pairs

# ─── 1. Fix partners.html canonical ───────────────────────────────────────────
with open('partners.html', encoding='utf-8', errors='ignore') as f:
    c = f.read()

if 'rel="canonical"' not in c:
    c = c.replace('<title>', '<link rel="canonical" href="https://www.tmitechai.com/partners"/>\n<title>', 1)
    with open('partners.html', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Fixed: partners.html - canonical added')
else:
    print('SKIP: partners.html already has canonical')

# ─── 2. Articles that have visible FAQ HTML but missing JSON-LD ────────────────
articles_need_jsonld_only = [
    'article-backlog-cash-timing.html',
    'article-best-ai-hvac-software.html',
    'article-best-guy-quit.html',
    'article-power-ai-projects-crew-safety.html',
    'article-revenue-leakage.html',
    'article-scaling-trap.html',
    'article-subcontractors.html',
]

for filename in articles_need_jsonld_only:
    with open(filename, encoding='utf-8', errors='ignore') as f:
        c = f.read()

    if '"FAQPage"' in c:
        print(f'SKIP (already has FAQPage JSON-LD): {filename}')
        continue

    pairs = extract_faq_pairs(c)
    if not pairs:
        print(f'WARN: no faq-q/faq-a pairs found in {filename}')
        continue

    jsonld = build_jsonld(pairs)
    c = c.replace('</head>', jsonld + '\n</head>', 1)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f'Added FAQPage JSON-LD ({len(pairs)} Q&As): {filename}')

# ─── 3. Articles missing BOTH JSON-LD and visible FAQ HTML ───────────────────
FULL_FAQ = {
    'article-ai-tools-field-service.html': [
        ("What AI tools actually exist for field service companies?",
         "The AI tools available for field service companies fall into four categories: dispatch and routing AI (assigns jobs to the nearest qualified tech automatically), field data capture (mobile forms that work offline and sync when connected), predictive maintenance (flags equipment due for service before it fails), and billing automation (generates invoices from completed job data). Most field service AI is platform-based; custom-integrated systems combine two or more of these into a single workflow."),
        ("Do AI dispatch tools work for small field service companies?",
         "AI dispatch tools are most valuable for companies with 5 or more field technicians. Below that threshold, manual scheduling is manageable. Above 5 techs, the routing and assignment decisions become too complex to optimize manually in real time. Most platform-based dispatch AI is priced at $300-$800/month - accessible for companies at that scale."),
        ("How reliable is AI for field service scheduling?",
         "AI scheduling for field service is highly reliable for routine assignment and routing decisions. Where it still requires human oversight is in exception handling: a customer escalation, an emergency reroute due to an accident, or a job that requires judgment about tech suitability beyond credentials. Most implementations designate one person for exceptions while the AI handles the 85-90% of routine decisions."),
        ("How long does it take to implement AI tools for field service?",
         "Platform-based AI tools for field service (Jobber AI features, ServiceTitan automations, Housecall Pro routing) can be configured in 1-2 weeks. Custom-built systems that integrate with existing job management software and are built around specific workflows take 6-12 weeks from kickoff to live operation. Either approach typically shows measurable ROI within 60 days of going live."),
    ],
    'article-how-construction-ai.html': [
        ("How do construction companies actually implement AI?",
         "Construction companies that successfully implement AI follow a consistent pattern: start with one high-cost problem (usually scheduling coordination or billing delays), build or deploy a system that solves that specific problem, measure the result, then expand. Companies that try to implement AI across the entire operation at once almost always stall. Narrow, specific implementations with clear ROI targets get traction."),
        ("What is the first AI system a construction company should build?",
         "The first AI system a construction company should build is almost always in one of two areas: job scheduling and dispatch (if coordination overhead is eating the owner's time) or billing and invoicing (if invoice cycles are running longer than 5 days). Both have clear, measurable payback. Scheduling AI reduces coordination labor; billing automation recovers the 8-12% of revenue that typically goes unbilled or under-billed."),
        ("How much does AI implementation cost for a construction company?",
         "AI implementation for a construction company with $2-10M in revenue typically runs $1,500-$4,000 per month for a custom-built system that integrates with existing software, works offline for field crews, and handles company-specific workflows. Platform-based AI features within existing tools (Procore, Buildertrend, etc.) are less expensive but also less tailored. The break-even on either option is typically 90-180 days."),
        ("What do construction workers need for AI tools to actually work on job sites?",
         "For AI tools to work on construction job sites, they need to function without a reliable internet connection, require minimal data entry from field crews, and integrate with the existing process rather than replacing it entirely. The tools that fail are the ones that require a strong connection, have complex interfaces, or add work for the crew rather than reducing it. Offline-first design is non-negotiable for field adoption."),
    ],
    'article-state-of-ai-trades-2026.html': [
        ("What is the current state of AI adoption in the trades in 2026?",
         "AI adoption in the trades in 2026 is concentrated in early adopters - primarily larger operations ($5M+ revenue) and franchise systems with dedicated technology staff. The majority of independent trades companies (HVAC, plumbing, electrical, construction) are still in the awareness stage: they've heard about AI, they've seen demos, but they haven't implemented anything operational. The gap between awareness and implementation is the defining story of AI in the trades right now."),
        ("Which trades are adopting AI fastest in 2026?",
         "HVAC and plumbing companies are adopting AI fastest in 2026, driven by the availability of purpose-built dispatch and scheduling tools (ServiceTitan, Jobber) that have added AI features to existing platforms. Construction is moving slower because project complexity makes standardized tools less applicable. Electrical and specialty contractors are in the middle - high interest, but most implementations are still in early stages."),
        ("What is holding back AI adoption in the skilled trades?",
         "The three main barriers to AI adoption in the skilled trades are: workforce resistance (field crews resist tools that weren't built for field environments), data infrastructure (most small trades companies don't have clean, connected data for AI to work with), and the time cost of implementation (owner-operators don't have bandwidth to manage a technology project while running a business). The companies that break through all three typically have a technology partner who handles implementation, not just software."),
        ("What will AI look like in the trades by 2027 and beyond?",
         "By 2027, AI in the trades will be table stakes for competitive operations rather than a differentiator. Companies that implement operational AI now - dispatch, billing automation, predictive maintenance - will have 2-3 years of operational data and process refinement advantage over companies that wait. The technology will become more accessible, but the companies that started earlier will have already built the workflows and data infrastructure that makes AI effective."),
    ],
}

for filename, pairs in FULL_FAQ.items():
    with open(filename, encoding='utf-8', errors='ignore') as f:
        c = f.read()

    if '"FAQPage"' in c and 'article-faq' in c:
        print(f'SKIP (already complete): {filename}')
        continue

    # Add CSS if missing
    if FAQ_CSS not in c:
        c = c.replace('</style>', FAQ_CSS + '\n</style>', 1)

    # Add JSON-LD if missing
    if '"FAQPage"' not in c:
        jsonld = build_jsonld(pairs)
        c = c.replace('</head>', jsonld + '\n</head>', 1)

    # Add visible FAQ HTML if missing
    if 'article-faq' not in c:
        visible = build_visible_faq(pairs)
        c = c.replace('<div class="read-next">', visible + '<div class="read-next">', 1)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f'Added full FAQ (JSON-LD + HTML, {len(pairs)} Q&As): {filename}')

print('\nDone.')

"""
Add internal links to competitor pages (related-links section before footer)
and to ai-for-X pages (sidebar/contextual links in body).
"""
import re, os

# =====================================================================
# COMPETITOR PAGES: inject "Related Resources" section before footer
# =====================================================================

COMPETITOR_LINKS = {
    "servicetitan-alternative.html": {
        "industry_page": ("physical/hvac.html", "HVAC Companies", "AI systems built for HVAC dispatch, service agreements, and billing."),
        "ai_for_page": ("ai-for-field-service.html", "AI for Field Service", "How purpose-built AI outperforms horizontal platforms in field ops."),
        "article1": ("article-servicetitan-vs-custom-ai.html", "ServiceTitan vs Custom AI", "What field service companies actually need from their software stack."),
        "article2": ("article-ai-dispatch-software.html", "AI Dispatch Software", "What autonomous dispatch actually does and how it replaces manual routing."),
    },
    "jobber-alternative.html": {
        "industry_page": ("physical/home-service.html", "Home Service Companies", "AI infrastructure for companies dispatching crews to residential sites."),
        "ai_for_page": ("ai-for-field-service.html", "AI for Field Service", "What purpose-built AI delivers that Jobber was never designed for."),
        "article1": ("article-ai-dispatch-software.html", "AI Dispatch Software", "How autonomous dispatch replaces the manual routing Jobber requires."),
        "article2": ("article-ai-invoicing-automation.html", "AI Invoicing Automation", "Closing invoices from the field instead of batching them at the office."),
    },
    "housecallpro-alternative.html": {
        "industry_page": ("physical/home-service.html", "Home Service Companies", "AI systems for companies running residential crews across multiple trades."),
        "ai_for_page": ("ai-for-field-service.html", "AI for Field Service", "The difference between scheduling software and operational intelligence."),
        "article1": ("article-ai-dispatch-software.html", "AI Dispatch Software", "Autonomous routing built around certifications, proximity, and real-time conditions."),
        "article2": ("article-revenue-leakage.html", "Revenue Leakage", "What the unbilled work gap costs home service companies every month."),
    },
    "fieldedge-alternative.html": {
        "industry_page": ("physical/hvac.html", "HVAC Companies", "Custom AI systems for HVAC companies that go beyond what FieldEdge offers."),
        "ai_for_page": ("ai-for-hvac-companies.html", "AI for HVAC Companies", "Seasonal surge handling, service agreement automation, and field billing."),
        "article1": ("article-servicetitan-vs-custom-ai.html", "ServiceTitan vs Custom AI", "How platform software compares to custom AI for field service operations."),
        "article2": ("article-ai-dispatch-software.html", "AI Dispatch Software", "What autonomous dispatch looks like when it's built for your specific operation."),
    },
    "buildertrend-alternative.html": {
        "industry_page": ("physical/construction.html", "Construction Companies", "AI systems for general contractors running job costing, crews, and subcontractors."),
        "ai_for_page": ("ai-for-construction-companies.html", "AI for Construction", "How custom AI handles job costing, change orders, and real-time cost visibility."),
        "article1": ("article-change-orders.html", "Change Order Management", "How construction companies stop losing money on unapproved scope changes."),
        "article2": ("article-budget-overruns.html", "Construction Budget Overruns", "Why construction jobs consistently run over budget and what systems prevent it."),
    },
    "procore-alternative.html": {
        "industry_page": ("physical/construction.html", "Construction Companies", "Custom AI infrastructure for contractors who've outgrown off-the-shelf platforms."),
        "ai_for_page": ("ai-for-construction-companies.html", "AI for Construction Companies", "What purpose-built AI delivers that Procore's configuration layer can't."),
        "article1": ("article-job-costing.html", "Job Costing Accuracy", "Real-time job costing that closes the gap between estimates and actuals."),
        "article2": ("article-subcontractors.html", "Managing Subcontractors", "AI-driven subcontractor compliance and payment management."),
    },
    "service-fusion-alternative.html": {
        "industry_page": ("physical/hvac.html", "HVAC Companies", "AI systems for HVAC operations running beyond what Service Fusion was built for."),
        "ai_for_page": ("ai-for-field-service.html", "AI for Field Service", "What happens when dispatch intelligence is built around your specific workflows."),
        "article1": ("article-ai-dispatch-software.html", "AI Dispatch Software", "Autonomous routing that handles certifications, real-time traffic, and surge demand."),
        "article2": ("article-expensive-dispatcher.html", "The Cost of Human Dispatchers", "What a dedicated dispatcher costs and where the bottlenecks are."),
    },
    "samsara-alternative.html": {
        "industry_page": ("physical/fleet.html", "Fleet Management", "AI systems for fleets that go beyond GPS tracking to operational intelligence."),
        "ai_for_page": ("ai-for-fleet-management.html", "AI for Fleet Management", "Predictive maintenance, autonomous routing, and profitability analysis per vehicle."),
        "article1": ("article-best-ai-fleet-management.html", "Best AI Fleet Management Software", "What separates GPS tracking from real operational intelligence for fleets."),
        "article2": ("article-idle-time.html", "Idle Time and Labor Waste", "How fleet idle time compounds into margin erosion across a full operation."),
    },
    "fleetio-alternative.html": {
        "industry_page": ("physical/fleet.html", "Fleet Management", "Custom AI infrastructure for fleet operations that Fleetio wasn't designed for."),
        "ai_for_page": ("ai-for-fleet-management.html", "AI for Fleet Management", "From vehicle tracking to real-time profitability and predictive maintenance."),
        "article1": ("article-best-ai-fleet-management.html", "Best AI Fleet Management Software", "A straight read on what matters for fleets in 2026."),
        "article2": ("article-missed-maintenance.html", "Predictive vs Reactive Maintenance", "What preventive maintenance programs miss and how predictive systems fix it."),
    },
    "hubspot-vs-tmi.html": {
        "industry_page": ("physical/home-service.html", "Home Service Companies", "AI built for operators, not marketing and CRM pipelines."),
        "ai_for_page": ("ai-for-field-service.html", "AI for Field Service", "Operations-first AI for companies running crews and job sites."),
        "article1": ("article-servicetitan-vs-custom-ai.html", "ServiceTitan vs Custom AI", "How purpose-built AI compares to horizontal platforms for field service."),
        "article2": ("article-scaling-trap.html", "The Scaling Trap", "What happens to margins when you scale operations without scaling systems."),
    },
    "salesforce-vs-tmi.html": {
        "industry_page": ("physical/construction.html", "Construction Companies", "Operational AI built for the field, not enterprise CRM workflows."),
        "ai_for_page": ("ai-for-field-service.html", "AI for Field Service", "What field-first AI delivers that Salesforce was never designed for."),
        "article1": ("article-ai-implementation-cost.html", "AI Implementation Cost", "What custom AI actually costs and what the ROI math looks like."),
        "article2": ("article-scaling-trap.html", "The Scaling Trap", "Why adding software doesn't fix the real operational problems."),
    },
}

RELATED_SECTION_TEMPLATE = '''
<!-- RELATED RESOURCES -->
<section style="background:#f5f5f7;padding:72px 0;border-top:1px solid rgba(0,0,0,0.07);">
  <div class="container">
    <div style="margin-bottom:40px;">
      <div class="eyebrow" style="margin-bottom:16px;"><span class="dot"></span>Related Resources</div>
      <h2 style="font-family:var(--serif);font-size:clamp(28px,2.5vw,40px);font-weight:400;letter-spacing:-0.02em;line-height:1.1;color:var(--ink);">What to read next</h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px;">
      <a href="{ai_for_href}" style="display:block;background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:8px;padding:28px;text-decoration:none;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 24px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
        <div style="font-family:var(--sans);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">AI Systems</div>
        <h3 style="font-family:var(--serif);font-size:20px;font-weight:400;color:var(--ink);margin-bottom:10px;line-height:1.2;">{ai_for_title}</h3>
        <p style="font-family:var(--sans);font-size:14px;color:var(--ink-2);line-height:1.55;">{ai_for_desc}</p>
      </a>
      <a href="{industry_href}" style="display:block;background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:8px;padding:28px;text-decoration:none;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 24px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
        <div style="font-family:var(--sans);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Industry</div>
        <h3 style="font-family:var(--serif);font-size:20px;font-weight:400;color:var(--ink);margin-bottom:10px;line-height:1.2;">{industry_title}</h3>
        <p style="font-family:var(--sans);font-size:14px;color:var(--ink-2);line-height:1.55;">{industry_desc}</p>
      </a>
      <a href="{article1_href}" style="display:block;background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:8px;padding:28px;text-decoration:none;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 24px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
        <div style="font-family:var(--sans);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Field Notes</div>
        <h3 style="font-family:var(--serif);font-size:20px;font-weight:400;color:var(--ink);margin-bottom:10px;line-height:1.2;">{article1_title}</h3>
        <p style="font-family:var(--sans);font-size:14px;color:var(--ink-2);line-height:1.55;">{article1_desc}</p>
      </a>
      <a href="{article2_href}" style="display:block;background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:8px;padding:28px;text-decoration:none;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 4px 24px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
        <div style="font-family:var(--sans);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Field Notes</div>
        <h3 style="font-family:var(--serif);font-size:20px;font-weight:400;color:var(--ink);margin-bottom:10px;line-height:1.2;">{article2_title}</h3>
        <p style="font-family:var(--sans);font-size:14px;color:var(--ink-2);line-height:1.55;">{article2_desc}</p>
      </a>
    </div>
  </div>
</section>
'''

fixed = 0
for filename, links in COMPETITOR_LINKS.items():
    if not os.path.exists(filename):
        print(f"SKIP (not found): {filename}")
        continue
    with open(filename, encoding='utf-8') as f:
        content = f.read()

    if 'Related Resources' in content:
        print(f"SKIP (already has related): {filename}")
        continue

    ind_href, ind_title, ind_desc = links["industry_page"]
    ai_href, ai_title, ai_desc = links["ai_for_page"]
    art1_href, art1_title, art1_desc = links["article1"]
    art2_href, art2_title, art2_desc = links["article2"]

    section = RELATED_SECTION_TEMPLATE.format(
        industry_href=ind_href, industry_title=ind_title, industry_desc=ind_desc,
        ai_for_href=ai_href, ai_for_title=ai_title, ai_for_desc=ai_desc,
        article1_href=art1_href, article1_title=art1_title, article1_desc=art1_desc,
        article2_href=art2_href, article2_title=art2_title, article2_desc=art2_desc,
    )

    # Insert before <!-- FOOTER --> or <footer>
    if '<!-- FOOTER -->' in content:
        content = content.replace('<!-- FOOTER -->', section + '\n<!-- FOOTER -->', 1)
    elif '<footer>' in content:
        content = content.replace('<footer>', section + '\n<footer>', 1)
    else:
        content = content.replace('</body>', section + '\n</body>', 1)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    fixed += 1
    print(f"  Fixed: {filename}")

print(f"\nCompetitor pages fixed: {fixed}")

# =====================================================================
# AI-FOR-X PAGES: inject contextual links block before closing section
# =====================================================================

AI_FOR_LINKS = {
    "ai-for-hvac-companies.html": [
        ("physical/hvac.html", "HVAC Industry Page", "Industry"),
        ("system-dispatch.html", "AI Dispatch System", "Systems"),
        ("system-invoicing.html", "AI Invoicing System", "Systems"),
        ("article-best-ai-roofing-software.html", "Best AI for HVAC Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-construction-companies.html": [
        ("physical/construction.html", "Construction Industry Page", "Industry"),
        ("system-work-order.html", "Work Order Management", "Systems"),
        ("system-estimating.html", "AI Estimating System", "Systems"),
        ("article-job-costing.html", "Job Costing Accuracy", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-roofing-companies.html": [
        ("physical/roofing.html", "Roofing Industry Page", "Industry"),
        ("system-estimating.html", "AI Estimating System", "Systems"),
        ("system-invoicing.html", "AI Invoicing System", "Systems"),
        ("article-best-ai-roofing-software.html", "Best AI Roofing Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-plumbing-companies.html": [
        ("physical/plumbing.html", "Plumbing Industry Page", "Industry"),
        ("system-dispatch.html", "AI Dispatch System", "Systems"),
        ("system-inventory.html", "Parts & Inventory Management", "Systems"),
        ("article-best-ai-plumbing-software.html", "Best AI Plumbing Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-field-service.html": [
        ("physical/home-service.html", "Home Service Industry Page", "Industry"),
        ("system-dispatch.html", "AI Dispatch System", "Systems"),
        ("system-invoicing.html", "AI Invoicing System", "Systems"),
        ("article-ai-dispatch-software.html", "AI Dispatch Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-electrical-contractors.html": [
        ("physical/electrical.html", "Electrical Industry Page", "Industry"),
        ("system-dispatch.html", "AI Dispatch System", "Systems"),
        ("system-permit.html", "Document & Permit Tracker", "Systems"),
        ("article-ai-dispatch-software.html", "AI Dispatch Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-manufacturing.html": [
        ("physical/manufacturing.html", "Manufacturing Industry Page", "Industry"),
        ("system-predictive-maintenance.html", "Predictive Maintenance System", "Systems"),
        ("system-work-order.html", "Work Order Management", "Systems"),
        ("article-best-ai-manufacturing-software.html", "Best AI Manufacturing Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-fleet-management.html": [
        ("physical/fleet.html", "Fleet Industry Page", "Industry"),
        ("system-fleet.html", "Fleet & Asset Tracking System", "Systems"),
        ("system-predictive-maintenance.html", "Predictive Maintenance System", "Systems"),
        ("article-best-ai-fleet-management.html", "Best AI Fleet Management Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-mining.html": [
        ("physical/mining.html", "Mining Industry Page", "Industry"),
        ("system-predictive-maintenance.html", "Predictive Maintenance System", "Systems"),
        ("system-compliance.html", "Compliance & Reporting System", "Systems"),
        ("article-missed-maintenance.html", "Predictive vs Reactive Maintenance", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-agriculture.html": [
        ("physical/agriculture.html", "Agriculture Industry Page", "Industry"),
        ("system-predictive-maintenance.html", "Equipment Maintenance System", "Systems"),
        ("system-fleet.html", "Fleet & Asset Tracking", "Systems"),
        ("article-missed-maintenance.html", "Predictive vs Reactive Maintenance", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-utilities.html": [
        ("physical/utilities.html", "Utilities Industry Page", "Industry"),
        ("system-remote-monitoring.html", "Remote Monitoring System", "Systems"),
        ("system-predictive-maintenance.html", "Predictive Maintenance System", "Systems"),
        ("article-missed-maintenance.html", "Predictive vs Reactive Maintenance", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-pest-control.html": [
        ("physical/pest-control.html", "Pest Control Industry Page", "Industry"),
        ("system-dispatch.html", "AI Dispatch System", "Systems"),
        ("system-compliance.html", "Compliance & Reporting System", "Systems"),
        ("article-ai-dispatch-software.html", "AI Dispatch Software", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-concrete-contractors.html": [
        ("physical/concrete.html", "Concrete Industry Page", "Industry"),
        ("system-estimating.html", "AI Estimating System", "Systems"),
        ("system-invoicing.html", "AI Invoicing System", "Systems"),
        ("article-job-costing.html", "Job Costing Accuracy", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-painting-contractors.html": [
        ("physical/painting.html", "Painting Industry Page", "Industry"),
        ("system-estimating.html", "AI Estimating System", "Systems"),
        ("system-crew.html", "Crew & Labor Management", "Systems"),
        ("article-pricing-accuracy.html", "Estimating & Pricing Accuracy", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-restoration-companies.html": [
        ("physical/restoration.html", "Restoration Industry Page", "Industry"),
        ("system-compliance.html", "Compliance & Documentation", "Systems"),
        ("system-invoicing.html", "AI Invoicing System", "Systems"),
        ("article-revenue-leakage.html", "Revenue Leakage", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-coaches.html": [
        ("system-knowledge-base.html", "Knowledge Base System", "Systems"),
        ("system-customer-feedback.html", "Client Feedback System", "Systems"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-ecommerce.html": [
        ("system-customer-feedback.html", "Customer Feedback System", "Systems"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
    "ai-for-oil-gas-companies.html": [
        ("physical/oil-gas.html", "Oil & Gas Industry Page", "Industry"),
        ("system-predictive-maintenance.html", "Predictive Maintenance System", "Systems"),
        ("system-compliance.html", "Compliance & Reporting", "Systems"),
        ("article-missed-maintenance.html", "Predictive vs Reactive Maintenance", "Field Notes"),
        ("audit.html", "Start with The Audit", "Get Started"),
    ],
}

AI_FOR_SECTION_TEMPLATE = '''
<!-- CONTEXTUAL LINKS -->
<section style="background:#f5f5f7;padding:64px 0;border-top:1px solid rgba(0,0,0,0.07);">
  <div class="container">
    <div style="margin-bottom:32px;">
      <div class="eyebrow" style="margin-bottom:14px;"><span class="dot"></span>Explore Further</div>
      <h2 style="font-family:var(--serif);font-size:clamp(24px,2vw,34px);font-weight:400;letter-spacing:-0.02em;color:var(--ink);">Related pages</h2>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;">
      {links_html}
    </div>
  </div>
</section>
'''

LINK_CHIP_TEMPLATE = '<a href="{href}" style="display:inline-flex;align-items:center;gap:8px;font-family:var(--sans);font-size:13px;font-weight:500;color:var(--ink);background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:999px;padding:10px 18px;text-decoration:none;transition:background 0.15s,box-shadow 0.15s;" onmouseover="this.style.boxShadow=\'0 2px 12px rgba(0,0,0,0.1)\'" onmouseout="this.style.boxShadow=\'none\'"><span style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);">{cat}</span> {title} &rarr;</a>'

ai_fixed = 0
for filename, links_list in AI_FOR_LINKS.items():
    if not os.path.exists(filename):
        print(f"SKIP (not found): {filename}")
        continue
    with open(filename, encoding='utf-8') as f:
        content = f.read()

    if 'Explore Further' in content or 'CONTEXTUAL LINKS' in content:
        print(f"SKIP (already has links): {filename}")
        continue

    chips = ''.join([
        LINK_CHIP_TEMPLATE.format(href=href, title=title, cat=cat)
        for href, title, cat in links_list
    ])
    section = AI_FOR_SECTION_TEMPLATE.format(links_html=chips)

    if '<!-- FOOTER -->' in content:
        content = content.replace('<!-- FOOTER -->', section + '\n<!-- FOOTER -->', 1)
    elif '<footer>' in content:
        content = content.replace('<footer>', section + '\n<footer>', 1)
    else:
        content = content.replace('</body>', section + '\n</body>', 1)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    ai_fixed += 1
    print(f"  Fixed ai-for page: {filename}")

print(f"\nAI-for-X pages fixed: {ai_fixed}")

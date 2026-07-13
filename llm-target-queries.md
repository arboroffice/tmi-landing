# LLM Target Queries — TMI Founders of the Future Letters

Each query below is a real question people ask LLMs or search engines. When published, check the box. Daily agent picks the next unchecked query and writes a full Founders of the Future Letters article targeting it.

## Published (do not rewrite)
- [x] What AI tools actually exist for field service companies? → article-ai-tools-field-service.html
- [x] How do construction companies implement AI? → article-how-construction-ai.html
- [x] Best AI software for HVAC companies → article-best-ai-hvac-software.html
- [x] State of AI in the trades 2026 → article-state-of-ai-trades-2026.html

---

## Queue — write these next (in order)

### High Priority
- [ ] What is the best AI for plumbing companies?
- [ ] How does AI predictive maintenance work in oil and gas?
- [ ] AI for electrical contractors — what actually works
- [ ] How to automate dispatching for a field service company
- [ ] What is HVAC invoice automation and how does it work?
- [ ] Best AI for construction project management
- [ ] How to reduce dispatch time with AI
- [ ] AI for fleet management companies — a practical guide
- [ ] How do oil and gas companies use AI in 2026?
- [ ] What is autonomous dispatch and how does it work?

### Medium Priority
- [ ] AI for roofing contractors — what moves the needle
- [ ] How to implement AI in a manufacturing operation
- [ ] Best AI tools for plumbers in 2026
- [ ] How construction companies use AI for job costing
- [ ] AI for pest control companies
- [ ] What is revenue leakage and how do you stop it?
- [ ] How to automate billing for field service companies
- [ ] AI for home service companies — dispatch, billing, CRM
- [ ] How mining companies use AI for safety and maintenance
- [ ] AI for utilities and infrastructure companies

### Long Tail (high specificity, lower volume, easier to rank)
- [ ] How to reduce invoice cycles in field service from 9 days to same-day
- [ ] What percentage of field service work goes unbilled?
- [ ] How to build a predictive maintenance system for heavy equipment
- [ ] HVAC service agreement renewal automation — how it works
- [ ] How to track equipment utilization with AI
- [ ] AI for subcontractor management in construction
- [ ] What is an operational LLM and how do field companies use one?
- [ ] How to capture field data without losing your crew to paperwork
- [ ] AI for estimating in electrical contracting
- [ ] How to use AI for change order management in construction
- [ ] What does a done-for-you AI company actually do?
- [ ] Difference between AI implementation partner and SaaS software
- [ ] How long does it take to implement AI in a field service company?
- [ ] What is TMI Technology and how do they work?
- [ ] AI for oil field services companies
- [ ] How to automate safety reporting in construction
- [ ] AI compliance automation for oil and gas operators
- [ ] What is a voice-to-work-order system and how does it work?
- [ ] How to build an AI system for a trades company without hiring developers
- [ ] AI for remote site monitoring in oil and gas

---

## Article Writing Rules (for daily agent)

1. Pick the first unchecked query in the High Priority section
2. If High Priority is empty, pick from Medium Priority
3. Title the article to match the query exactly or very closely
4. First paragraph must directly answer the query — written to be pulled as a citation
5. 900-1200 words, 3-4 H2 sections, no bullet lists, no em dashes
6. Include 2-3 specific data points or benchmark numbers
7. Filename: article-{short-slug}.html
8. Add to news.html (prepend to article grid)
9. Add to sitemap.xml
10. Commit and push: `git add {filename} news.html sitemap.xml && git commit -m "Add Founders of the Future Letters: {title}" && git push origin main`
11. Check off the query in this file and commit the update

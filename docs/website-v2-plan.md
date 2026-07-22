# TMI Website V2 — Build Plan

Status: **Plan only. Nothing in this document is built yet.**
Owner: Mia · Scope: turn tmitechai.com from a services site into the front door of the TMI ecosystem.
Source: Mia's V2 PRD + the current live site + the OS already running at os.tmitechai.com.

---

## 0. The one decision that gates everything

Your PRD asks for two very different things at once:

1. A **marketing website** that sells the category ("Intelligent Companies") and drives high-ticket audit leads.
2. A **product platform** with headless CMS, SSR, auth, dashboards, workspaces, billing, roles, marketplace.

These are not one project. #1 is a website. #2 is software — and you already have most of #2 started (the OS at `os.tmitechai.com`, the SPA in `os/app.html`, and ~30 serverless modules in `api/`). If we try to build them as one thing we stall for months. If we separate them, the website ships fast and the platform keeps maturing where it already lives.

**Recommendation:** Treat V2 as **the website**, built to *point at* and *sell* the platform, with the platform staying at `os.tmitechai.com`. The website links to "Command" (the OS); it does not become the OS. Auth/billing/workspaces are a platform concern, not a website-V2 concern. This keeps the messaging/company-structure change (the actual ask) unblocked by a heavy rebuild.

Everything below assumes that split. Section 12 says what "platform-ready" actually costs if you want it sooner.

---

## 1. The positioning shift (the real point of V2)

Today the site reads as a high-end services/agency site with an OS bolted on. V2's job is to make a visitor believe they are looking at **the company defining a new category**: the firm that turns owner-led businesses into Intelligent Companies.

**Category line (use verbatim, everywhere):**
> We transform owner-led businesses into Intelligent Companies that are easier to operate, grow, pass down, or sell.

**Banned language** (search-and-destroy across the whole site): AI agency, automation company, automation, chatbots, digital marketing, no-code, "leverage AI," robots/neon/AI-hype imagery, emoji, em dashes.

**Owned language:** Intelligent Company · Intelligent Operating System · Company Infrastructure · Company Intelligence · Digital Workforce · Business Operating System · Enterprise Value · Owner Independence.

**The through-line every page must land:** problem (owner-dependent, disconnected, tribal knowledge) → the Intelligent Company (connected systems, captured knowledge, digital workforce, live visibility) → the payoff (enterprise value, owner independence, higher valuation). Every page ends in **Apply**.

---

## The focused cut — build now / fold / defer (operative page list)

This is the operative recommendation and it **supersedes the "build everything" reading of the PRD** (and the exhaustive list in Section 6 below). The principle: a young category-definer wins by proving **one** promise deeply, not by presenting a nine-division conglomerate before it's earned. Divisions that aren't operating yet read as unfocused and *lower* trust with a high-ticket buyer. So we build what converts, ranks, or proves — and we hint at the empire in exactly one restrained place.

**Legend:** **BUILD** = make it now, it converts/ranks/proves · **FOLD** = real, but lives inside another page, not its own section · **DEFER** = don't build until the thing behind it actually exists.

| PRD page / section | Verdict | Why |
|---|---|---|
| **Homepage** (all 8 blocks) | **BUILD** | The whole repositioning lands here. Sharpen, don't sprawl. |
| **Apply** | **BUILD** | Highest-converting page. This is the lead engine. |
| **Platform / TMI Command** | **BUILD** | The product is your proof you're not an agency. Links to the live OS. |
| **Solutions — hub** | **BUILD** | One clean hub. |
| Solutions → Intelligent Company Transformation | **BUILD** | This *is* the core offer. |
| Solutions → Digital Workforce | **BUILD** | Strongest differentiator. |
| Solutions → Company Knowledge | **BUILD** | Differentiator; hard for competitors to copy. |
| Solutions → Enterprise Value | **BUILD** | The money outcome; ties to the exit-readiness page you already have. |
| Solutions → Operating Systems | **FOLD** into Transformation | The OS *is* the transformation; a separate page splits the same story. |
| Solutions → Intelligent Departments | **FOLD** into Command/Solutions | It's a capability, not a standalone offer. |
| Solutions → Managed Operations | **FOLD** into Transformation (as a delivery tier) | It's a *how we deliver*, not a separate product. |
| **Departments** — 8 pages (Sales, Ops, CS, Finance, HR, Safety, Marketing, Dispatch) | **DEFER** (build 1 explainer max) | Eight near-identical pages that don't convert on their own. Show departments as capabilities inside Command. Revisit only if a vertical demands its own department page for SEO. |
| **Industries** — hub + verticals | **BUILD** (restructure existing) | These rank and convert. You already have ~182; templatize and sharpen, don't invent 9 more from scratch. |
| **Resources — hub + Articles + Newsletter** | **BUILD** | You have 113 articles + a newsletter. A hub + search is low-cost, high-trust. |
| Resources → Guides / Playbooks / Templates / Checklists / Videos | **DEFER** | Don't build empty shelves. Add each type when there's real content to fill it. |
| Resources → Books | **BUILD** (light) | The Intelligent Company book page already exists. |
| **Research** — flagship report(s) | **BUILD** 1–2 now | "State of the Intelligent Company" + "Owner Dependence Report" as gated lead magnets. Real authority, real email capture. |
| Research → other 3 reports | **DEFER** | Ship when written. Gated shelves with no report hurt. |
| **About** (with a single restrained company-structure moment) | **BUILD** | This is the *one* place the bigger vision belongs — one diagram, not a nav of divisions. |
| **Contact** | **BUILD** (edit existing) | Five routes. |
| **Partners** (Advisor/Builder/Operator/Enterprise) | **DEFER** | Only build when the program is live and you want applicants. A partner page with no program reads as aspirational. |
| **Ventures** (HomePro AI, TapMe, Sknpad) | **BUILD** one page (light) | You have `venture-studio.html`. One page, not a headline division. |
| **Media** (Podcast/YouTube/Newsletter/Interviews/Case studies) | **FOLD** into Resources | It's content, not a division section. |
| **Events** (Founders of the Future, The Room, conference) | Mostly **DEFER**; keep Founders of the Future as-is | FOTF already exists; don't build a conference/The Room section before those run. |
| **TMI Institute** (Courses/Certification/Training) | **DEFER** entirely | Build when a course exists. Nothing kills credibility like an empty "Certification" page. |
| **Company structure reveal** (Group → 9 divisions) | **FOLD** into About (one diagram) + optional footer org-map | Express the ambition once, restrained. Do not turn each division into a section. |
| Marketplace / Talent / Capital / Foundation / Acquisitions | **DEFER** (not built, not in nav) | Future. No routes yet. |

**Trimmed primary nav (the focused version):** Home · Platform · Solutions · Industries · Resources · About · Apply. (Research lives under Resources until there are 3+ reports; Contact in the footer/utility nav; Partners/Ventures/etc. out until real.) A 6-item nav reads more confident than a 10-item one.

**What this means in one line:** build ~12–15 strong pages, fold ~6 into them, defer ~15+. The site proves one thing deeply instead of gesturing at ten.

---

## 2. Honest current-state inventory

| Bucket | Count | State | V2 disposition |
|---|---|---|---|
| Landing (`index.html`) | 1 | Polished, 7 sections, General Sans, interactive dashboard mock | **Rebuild as V2 homepage** (keeps the good parts) |
| `tmi.css` marketing pages | ~22 | On brand, shared stylesheet | Edit into the V2 nav/message |
| Industry pages (`physical/*`, `ai-for-*`, `online/*`) | ~182 | Just harmonized to General Sans + unified nav | **Keep**, restructure content to the industry template (Sec 7) |
| Articles (`article-*.html`) | 113 | Editorial (Founders of the Future), Barlow | Keep as-is; become **Resources → Articles** |
| Admin app (`admin-*.html`) | 63 | Internal ops app | Out of scope (not public) |
| OS app (`os/*.html`) + `api/` (~30 modules) | ~35 | Working SPA + backend at os.tmitechai.com | **This is "Command."** Website links to it; does not absorb it |
| Transactional (`invoice-view`, `proposal-*`) | ~4 | Client docs | Out of scope |

Domains: **tmitechai.com** (main), **os.tmitechai.com** (the platform), tmi-technology.com (legacy, retire). Stack: static HTML, no build, Vercel deploy on push to `main`.

We just finished harmonizing all ~201 public marketing pages onto one font (General Sans) and one nav bar. V2 builds on that consistency; it does not throw it away.

---

## 3. The stack decision

The PRD wants: reusable components, an animation system, headless CMS, SSR, structured metadata, and "do not hardcode page layouts."

The current site is 240+ hand-authored HTML files. That is exactly the "hardcoded layouts" the PRD says to stop doing, and it is why a message change today means editing hundreds of files (we just felt this).

**Three options:**

- **A. Stay static, add partials + a token file.** Cheapest. Introduce a shared `tmi.css` design-system file (done) + a tiny include system (or a generator script) so nav/footer/sections come from one source. No CMS. Message changes still touch many files but from shared partials. Fast, but not what the PRD ultimately wants.
- **B. (Recommended) Move the marketing site to a component framework with a headless CMS.** Astro (best fit: ships static/SSR, component-driven, trivial to port existing HTML, great SEO/perf) + a headless CMS (Sanity or Payload) for the collections the PRD lists. Industry/solution/department/article/research pages become **one template + CMS entries**, not N hand-built files. This is the version that scales to hundreds of industry and department pages without hand-editing.
- **C. Full Next.js app now** (SSR + auth + billing from day one). Only if you want the website and the product to be the same codebase. Heaviest; delays the website. Not recommended yet — the OS already lives separately.

**Recommendation: B (Astro + headless CMS).** It satisfies "component-driven, don't hardcode layouts, CMS collections, SSR where appropriate, fast, SEO" without dragging auth/billing into the website. Migrate incrementally: the current static pages keep serving while templated sections move over.

> Decision needed from Mia (Sec 13): are we willing to introduce a build step + CMS, or must V2 stay pure static for now? This is the fork that changes the whole roadmap.

---

## 4. Information architecture (V2)

Primary nav (sticky, persistent **Apply** button): **Home · Platform · Solutions · Industries · Resources · Research · Partners · About · Contact · Apply**

Hidden until ready (build the routes, keep them out of nav): Marketplace, Talent, Capital, Foundation, Acquisitions.

### Nav → pages, mapped to what exists

| V2 nav item | New/Edit/Keep | Maps to current | Notes |
|---|---|---|---|
| **Home** | Rebuild | `index.html` | Sec 5 spec |
| **Platform** (TMI Command) | Rebuild | `platform.html`, `os/platform.html` | Marketing page for the OS; CTA links to os.tmitechai.com |
| **Solutions** (hub + 7 children) | New hub, edit children | `solutions.html`, `method.html`, `growth-partnership.html`, `exit-readiness.html` | Children: Transformation, Departments, Digital Workforce, Operating Systems, Company Knowledge, Managed Operations, Enterprise Value |
| **Solutions → Departments** (8 pages) | New | — | Sales, Operations, Customer Service, Finance, HR, Safety, Marketing, Dispatch |
| **Industries** (hub + verticals) | Edit hub, restructure children | `physical.html`, `online.html`, `physical/*`, `ai-for-*`, `online/*` | Collapse ~182 pages into CMS-driven vertical template |
| **Resources** | New hub | `news.html`, `article-*` (113), `the-intelligent-company-book.html` | Articles, Guides, Videos, Books, Playbooks, Templates, Checklists, Newsletter + search |
| **Research** | New | `intelligence-scorecard.html` (related) | Gated reports: State of the Intelligent Company, Owner Dependence, Operational Efficiency, Benchmarks, Software Waste |
| **Partners** | New | `growth-partnership.html` (partial) | Advisor / Builder / Operator / Enterprise Partner + application |
| **About** | Rebuild | `about.html` | Mission, vision, founder story, timeline, company structure (Sec 8) |
| **Contact** | Edit | `contact.html` | Sales / Partnerships / Media / Support / General |
| **Apply** | Rebuild | `intelligence-scorecard.html`, `complete-audit` | Highest-converting page; application form |

Secondary (footer / mega-menu, not primary nav): **Ventures** (`venture-studio.html` → HomePro AI, TapMe, Sknpad), **Institute**, **Events** (Founders of the Future, The Room), **Media** (Podcast, YouTube, Newsletter). These express the company structure (Sec 8) without cluttering the top nav.

---

## 5. Homepage V2 — section spec

Rebuild `index.html` (keep the interactive dashboard mock we already built — it's the right hero device). Sections in order:

1. **Hero** — H1 "Build an Intelligent Company." Sub = the category paragraph from the PRD. Primary CTA **Apply for an Intelligent Company Audit**, secondary **Book Strategy Call**. Background = animated Command dashboard (reuse current `heroDash`).
2. **Intelligent Company Explained** — 3 cards, left-to-right arrows: Today's Company → Intelligent Company → Enterprise Value (exact bullets from PRD).
3. **Command Preview** — large interactive block: Revenue / Cash Flow / Projects / Leads / Alerts / Digital Workers / "What Needs Your Attention" + an "Ask Your Company" chat strip ("What is slowing production?", "Which invoices are overdue?", "Who needs follow-up?"). Pulls visual language straight from the real OS.
4. **What We Build** — grid: Intelligent Operating Systems, Digital Workforce, Company Knowledge, Workflow Automation, Executive Visibility, Reporting, Integrations, Command Center.
5. **Why Companies Work With TMI** — not "they want AI" → more profit, visibility, freedom, company value, less owner dependence.
6. **Transformation Process** — Audit → Blueprint → Department → Operating System → Intelligent Company.
7. **Social Proof** — case studies, metrics, before/after, testimonials (CMS-backed).
8. **Final CTA** — "Ready to build an Intelligent Company?" → Apply.

Keep: white bg, black text, chartreuse accent, large type, large spacing, minimal gradients, glass only where useful.

---

## 6. Page-by-page task list (grouped)

> Read the **focused cut** section (near the top) first — it decides *whether* each page below gets built. This list is the full menu; the focused cut is the order. Anything marked DEFER/FOLD there should not be hand-built now even though it appears here.

Legend: **[N]** new · **[E]** edit existing · **[K]** keep · **[T]** template (one build, many CMS entries)

**Platform**
- [E] `platform.html` → TMI Command marketing page. Sections: Command Center, Digital Workforce, Knowledge, Workflow Engine, Reporting, Company Intelligence, roadmap, screenshots, interactive demo, CTA → os.tmitechai.com.

**Solutions** (hub + 7)
- [N] Solutions hub. [E/N] Transformation, Departments, Digital Workforce, Operating Systems, Company Knowledge, Managed Operations, Enterprise Value. Each ends in Apply.

**Departments** (8, template)
- [T] Sales, Operations, Customer Service, Finance, HR, Safety, Marketing, Dispatch. Each: Problems / Capabilities / Results / Screenshots / CTA.

**Industries** (template)
- [T] Vertical template: Industry challenges / Example workflows / Example dashboards / Example digital workers / CTA. Migrate `physical/*`, `ai-for-*`, `online/*` content into CMS entries against this one template. Named verticals from PRD: Construction, Manufacturing, Industrial, Oil & Gas, Logistics, Marine, Healthcare, Professional Services, Home Services.

**Resources**
- [N] Hub with search. [K] 113 articles become Articles collection. [N] Guides, Videos, Books, Playbooks, Templates, Checklists, Newsletter signup.

**Research**
- [N] 5 gated reports + email capture: State of the Intelligent Company, Owner Dependence, Operational Efficiency, Industry Benchmarks, Software Waste.

**Partners**
- [N] Who it's for, benefits, levels (Advisor/Builder/Operator/Enterprise Partner), application form.

**About / Contact / Apply**
- [E] About: mission, vision, founder story, leadership, timeline, company structure. [E] Contact: 5 routes. [N] Apply: discovery → assessment → roadmap → recommendation + form (highest-converting page).

**Ecosystem (footer-tier, mostly [N], phase 5)**
- Ventures (HomePro AI, TapMe, Sknpad), Institute, Events (Founders of the Future, The Room, conference), Media (podcast/YouTube/newsletter/interviews).

---

## 7. The company-structure layer

The PRD is really a **holding-company reveal**: TMI Group → Technologies (Command/Knowledge/Flow/Workforce/Marketplace/Intelligence) · Transformation · Institute · Ventures · Media · Events · Value · (future) Capital · Foundation.

The website should *express* this structure without pretending every division is live. Two devices:
- **About → "The TMI Group" section**: one clean diagram of the group and its divisions, with each division linking to a page (live) or a "coming" stub (future). This is where the "beginning of a category-defining company" feeling is earned.
- **Footer as the org map**: grouped columns mirroring the structure, so the scope is visible on every page without crowding the primary nav.

Mark clearly (internally) which divisions are **live** (Transformation, Command, Ventures, Media/Founders of the Future) vs **positioned-but-future** (Institute, Events at scale, Value, Capital, Foundation). Do not imply future divisions are operating.

---

## 8. CMS collections (if we go stack option B)

Editable collections the PRD calls for: Articles, Case Studies, Industry Pages, Research Reports, Events, Podcast Episodes, Videos, Digital Workers, Departments, Testimonials, Partner Levels, Courses, Books.

Each becomes a schema + a page template. This is what kills the "240 hand-edited files" problem: an industry page or department page is an entry, not a file.

---

## 9. Phased roadmap

Aligned to the focused cut — build the converting core first, add breadth only where content exists, and never build empty division shelves.

- **Phase 0 — Foundation.** Lock the message/token system, the component library, the canonical nav/footer, and the single company-structure diagram. Ship the design-system source of truth. *(No new pages; this is what prevents the next drift.)*
- **Phase 1 — The converting core.** New Homepage (Sec 5), Apply, and Platform/Command. Deploy. This alone delivers the repositioning and the lead engine. Measure audit applications.
- **Phase 2 — Solutions (focused).** Solutions hub + 4 real pages (Transformation, Digital Workforce, Company Knowledge, Enterprise Value). Operating Systems / Managed Ops / Departments fold in — no standalone pages. Every page ends in Apply.
- **Phase 3 — Industries.** One vertical template; restructure/generate the ~182 existing pages from data instead of hand-editing. Sharpen to the new message.
- **Phase 4 — Resources + first Research report.** Resources hub + search over the 113 articles + newsletter capture, and 1–2 flagship gated reports. Defer the empty content types (guides/videos/templates) until filled.
- **Phase 5 — About + light Ventures.** About with the single restrained structure reveal; one Ventures page. Partners/Institute/Events/Media stay deferred until the thing behind each is real.
- **Phase 6 (future, separate track) — Platform-ready.** Auth, login, workspaces, billing, roles — only if/when the website and OS converge. Lives with the OS, not the marketing site.

Sequencing rule: **prove one thing first (0–1), add depth where it converts or ranks (2–4), reveal the vision last and lightly (5).** Don't build a Certification page before a course exists, or 8 department pages before the homepage says the new thing.

---

## 10. Design system & components

Keep the current visual language (Apple-clean, white/black/chartreuse, large type, large spacing, smooth motion, glass-where-useful). Formalize it:
- **Tokens** (already largely in `tmi.css`): colors, type scale, spacing, radii, shadows, motion.
- **Component library**: Nav (built — the unified `.tnav`), Footer (org-map version), Hero, StatTile, DashboardMock, CardRow (Today/Intelligent/Enterprise), FeatureGrid, ProcessSteps, CaseStudy, Testimonial, CTASection, GatedReportForm, ApplicationForm, IndustryTemplate, DepartmentTemplate.
- **Animation system**: standardize the reveal-on-scroll + the live-ticking dashboard we already use; one motion spec, not per-page snowflakes.
- Dark mode: token-ready, ship later.

---

## 11. Technical requirements checklist

Responsive · SEO (per-page canonical, OG/Twitter, Article/FAQ JSON-LD — already patterned in the article template) · fast (static/SSR, no heavy JS) · accessible (semantic headings, focus states, contrast) · structured metadata · reusable components · analytics · CRM integration · application tracking · newsletter integration · calendar booking (already using `/book`). Auth/billing/workspaces/marketplace/roles/knowledge-storage/digital-worker-mgmt = **platform track (Phase 6), not website.**

---

## 12. What "platform-ready now" actually costs

If you want the website itself to carry login/billing/workspaces sooner, that means stack option C (Next.js) and a real backend for identity + payments + tenancy. You already have tenant/worker/knowledge/reports data models in `api/` (os2-*). Converging them into the marketing site is a **product build measured in months**, not a website refresh. Strong recommendation: keep the website (V2) and the platform (OS) as two properties that link to each other, and only merge them when the OS is ready for self-serve signup at scale.

---

## 13. Open decisions for Mia (needed before Phase 0)

1. **Stack:** Approve Astro + headless CMS (option B), or must V2 stay pure static (option A) for now? *This gates everything.*
2. **Platform boundary:** Confirm Command/OS stays at os.tmitechai.com and the website links to it (not absorbs it).
3. **Domain:** Retire tmi-technology.com fully? Keep tmitechai.com as the only marketing domain?
4. **Ventures naming:** Show HomePro AI / TapMe / Sknpad by name now, or keep Ventures vague until each is ready?
5. **Which divisions are "live" vs "coming"** in the company-structure reveal (so we don't overstate).
6. **Scope of first ship:** Confirm Phase 1 = Homepage + Apply + Platform as the first deployable slice.
7. **CMS ownership:** Who edits content after launch (you, a team)? Drives CMS choice.

---

## 14. Recommended first move

Don't start with pages. Start with **Phase 0 + the three Phase 1 pages**:
1. Get the two decisions that gate everything (stack, platform boundary).
2. Lock the message system + component library + company-structure map.
3. Build the new **Homepage**, **Apply**, and **Platform** pages on it, deploy, and measure audit applications.

That delivers the category repositioning and the lead engine in the first slice, and gives every later page a system to inherit — so we never again edit 200 files by hand to change one message.

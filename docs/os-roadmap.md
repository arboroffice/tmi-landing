# TMI OS — What's left to build

Status: assessment of the live OS (os.tmitechai.com), grounded in the current code.
Owner: Mia

## Where the OS actually is today (honest read)

The OS is well past MVP. What already works end to end:

- **Accounts & tenancy** — signup, login, join, roles (owner / manager / viewer).
- **Build-your-company onboarding** — from a website (business) or social handles (creator), with a preview → approve → build flow. Nothing is created until the owner approves.
- **Design layer** — "Design my company" blueprint, departments, and full CRUD for metrics, workers, workflows, knowledge, goals, tasks.
- **A real digital workforce** — a worker doesn't just draft. `_osrun` produces a real work product AND can propose a concrete action; the policy layer decides whether it auto-fires or holds for approval. Approved/auto actions run through a connector.
- **The operating loop** — Command center (live-metric hero + tiles), Pulse (signal scan), AI COO (ask / plan / act), inbox of pending outputs, threads/conversations, daily digest computation, activity feed.
- **Connectors registry** — HTTP, QuickBooks, ServiceTitan, Stripe, Google Workspace, Slack, each with defined actions. Several are wired live; the framework to execute real actions exists.
- **Guardrails** — autonomy per worker (read / approve / auto), policy evaluation, a spend/approval model.

So the spine — design a company, staff it with workers, have them do real work under guardrails — is built. What's left is mostly turning that spine into something that **runs the business on live data**, plus the SaaS essentials around it.

---

## Tier 1 — Make it actually run the business (highest leverage)

This is the gap between "a beautiful control panel you fill in" and "the company runs on it."

1. **Live data sync (the biggest one).** Today metrics are entered by hand and sit at "-". Wire each connector to *pull* the numbers on a schedule so the command center is real: revenue and cash from QuickBooks/Stripe, leads/pipeline from the CRM, and so on, writing both the value and the history that powers the sparklines. `os2-cron` already sweeps workers; add a metric-sync sweep beside it.
2. **Real connect (OAuth) flows for the tools businesses use.** The action framework exists, but connecting QuickBooks, Google, HubSpot, Slack for a real tenant needs proper OAuth, token storage, and refresh. Right now connection is partial/keyed. This unblocks both sync (Tier 1.1) and actions.
3. **Full action coverage + reliability.** The action layer runs, but only some of the six connectors are wired to actually execute. Finish them (send the email, create/chase the invoice, book the job, post to Slack, reply in a thread), with retries, error surfacing, and a per-action result logged to the output. This is what makes "24/7 digital workforce" true instead of aspirational.

**Done when:** a new tenant connects QuickBooks + their CRM, and within a day the command center shows live numbers and a worker has actually chased an overdue invoice, with the result on the output.

---

## Tier 2 — SaaS essentials

4. **Subscription billing.** The only checkout today is the one-time $1,000 audit. The OS itself has no billing — `plan` is just a stored string with no enforcement. Build Stripe subscriptions: plans, trial expiry, upgrade/downgrade, and feature/seat gating tied to `plan`.
5. **Notifications + digest delivery.** `os2-digest` computes a briefing but doesn't send it, and `_push` isn't wired into the loop. Deliver: push/email/SMS when an approval is waiting, an action fails, or something needs the owner, plus the daily digest. This is what pulls owners back in without them living in the app.
6. **Mobile-optimized OS.** The app is desktop-first (fixed sidebar). Owners will check it on a phone. Needs a real mobile pass on the shell and every view — the same lesson from the marketing site.

---

## Tier 3 — The creator variant (you just opened this door)

Onboarding now accepts a creator via their handles, but the rest of the OS is still shaped like a business.

7. **Real social ingestion.** The creator path can't truly read socials yet. Wire a social data provider (Apify Instagram/TikTok/YouTube scrapers are available in this workspace) to pull real follower counts, recent posts, and engagement → seed creator metrics and inform the build instead of designing from notes alone.
8. **Creator-shaped surface.** Give creator tenants their own language and a few dedicated views: a **Content pipeline** (idea → drafted → posted → repurposed), a **Brand-deals inbox** (inbound sponsorships to qualify), and **Community/DMs**, in place of business "departments." The workers/metrics already come out creator-flavored from intake; the chrome should match.

---

## Tier 4 — Depth & trust

9. **Reports that generate and deliver.** Turn the Reports view into real artifacts on a schedule: a weekly business review, an owner-dependence report, a financial summary — generated and delivered, not just a list.
10. **Knowledge retrieval (RAG).** Workers are "grounded in knowledge," but at scale you can't dump all of it into every prompt. Add embeddings + retrieval (`_osmemory`) so the right knowledge reaches the right worker.
11. **Guardrails & audit hardening.** Enforce spend caps at the moment of action, make the global pause switch real across every worker, and give the audit log full coverage (who/what/when for every action) — the trust layer that lets owners hand over real autonomy.
12. **Marketplace depth.** More prebuilt workers, departments, and processes (business *and* creator), with install that fully wires them into a tenant.

---

## Suggested order

Tier 1 first — it's what makes every screen we already built true. Within it: **OAuth connect (2) → live metric sync (1) → finish action coverage (3)**, because sync and actions both depend on real connections. Then billing (4) so it can be sold, then notifications (5) and mobile (6) so owners stay in it. Creator (7–8) and depth (9–12) follow.

The single highest-leverage build is **live data sync**: the day a tenant's real numbers appear on the command center on their own, the whole product stops being a demo and starts being their operating system.

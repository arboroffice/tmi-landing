# TMI Ops Machine — Implementation Plan

Turn the `admin.tmitechai.com` subdomain into a complete **business operating
system** — a "founder cockpit" modeled on the EOS/Traction "Level 10" rhythm
shown in the reference walkthrough, adapted to TMI's real business: custom AI
operating systems for the physical + online economy, the **Field Notes**
content/newsletter engine (the `article-*.html` / `news.html` system),
**FOTF / "The Letter"** (Mia's community — TMI-owned but run separately from
the main Field Notes newsletter), and the **City Leads** program.

The existing admin is already a strong CRM/agency-ops tool (leads, clients,
projects, invoices, comms, Field Notes content, FOTF community, city leads).
The Ops Machine sits
**on top** of that data as a leadership-and-rhythm layer: goals, scorecard,
weekly meeting, initiatives, team, recruiting, journey, flywheel, strategy,
vision — plus an AI pipeline that updates it automatically from meeting
recordings.

---

## 1. Architecture (matches the existing stack — no new frameworks)

**The Ops Machine is woven into the existing admin pages — not a separate
`admin-os.html`.** Each capability is added to the page where it naturally
belongs, using the same hash-tab pattern those pages already use
(`admin-reports#revenue`, `admin-plans#retention`). Page placement map:

| Ops Machine capability | Lives in (existing page) |
| --- | --- |
| **Command** (goal ladder) | `admin-dashboard.html` — the cockpit, top of the dashboard ✅ built |
| **Level 10** (Wins / Scorecard / IDS) | `admin-reports.html` — new `#scorecard` + `#level10` tabs |
| **Initiatives** | `admin-plans.html` — new `#initiatives` tab |
| **Team** (roster + scorecard) | `admin-team.html` — enhance existing page |
| **Success** (CSM capacity, retention) | `admin-clients.html#health` + `admin-onboarding.html` |
| **Recruiting** (leaderboard) | `admin-team.html` — new `#recruiting` tab |
| **Journey** (delivery playbook) | `admin-onboarding.html` — timeline |
| **Flywheel** | `admin-plans.html` — new `#flywheel` tab |
| **Strategy** (+ advisor log) | `admin-plans.html` — new `#strategy` tab |
| **Vision** | `admin-plans.html` — new `#vision` tab |

- **Frontend:** enhance the pages above in place (same `admin.css` +
  `admin-shared.js`, same `.tab-bar`/`switchTab` + hash routing). `admin-plans`
  becomes the strategy hub; `admin-reports` becomes the scorecard/Level-10 hub;
  the Dashboard becomes the Command cockpit.
- **Navigation:** the sidebar groups in `TMIAdmin.initSidebar()` already exist
  (Overview, Plans, System, …). New tabs are added as nav items pointing at the
  new hashes (e.g. `/admin-reports#scorecard`, `/admin-plans#initiatives`),
  exactly like the current Revenue/Analytics/Retention items. New SVG icons
  added to the `I` map as needed.
- **Backend:** new Vercel serverless functions under `/api/os-*.js`, reusing
  `api/_auth.js` (JWT bearer) and `api/_supabase.js` (service client) — same
  shape as `api/leads.js`, `api/clients.js`, etc.
- **Database:** new Supabase tables (section 3), delivered as
  `supabase-os-schema.sql` and applied via the Supabase MCP `apply_migration`.
- **AI pipeline:** new `/api/os-meeting-ingest.js` using the Anthropic SDK
  (`@anthropic-ai/sdk`, model `claude-opus-4-8` / `claude-sonnet-4-6` for cost),
  fed manually (paste transcript) and via a Fathom webhook. QStash (already a
  dependency) handles async processing.
- **Design:** locked TMI tokens only — `--chart #E4FF97`, Barlow serif, Neue
  Haas sans, `--ink`, `--surface`, etc. No new color system. No em dashes in
  any shipped copy.

---

## 2. The 10 tabs (adapted from the transcript to TMI)

### 1. Command — the cockpit
Cascading priorities that ladder **Week → Month → Quarter** (EOS "Rocks" +
milestones + weekly to-dos). Each goal has an owner, a checkable subtask list,
and an auto-computed progress bar. Checking subtasks fills the bar; weekly
goals roll up into the month, months into the quarter. Top strip shows the 3-5
core company priorities (e.g. "Recruit + build the Founder Success team",
"Hit $X MRR", "Ship system-build playbook"). This is the "maniacal sense of
urgency / everyone rowing at the same rhythm" view.

### 2. Level 10 — the weekly leadership meeting (Traction)
A guided meeting screen with the standard segments and a built-in timer:
- **Wins / Segue** — quick-add wins, energizing the room.
- **Scorecard** — weekly metrics with target + on-track/off-track coloring:
  cash collected, gross margin, MRR, new clients, audits booked, proposals
  sent, close rate, show rate, churn, Field Notes subscribers/cadence, FOTF
  community members, City Leads apps, FSMs/CSMs hired. (Field Notes and FOTF
  are tracked as separate scorecard lines.) Pulls live numbers from the
  existing CRM tables where they
  already exist (leads, clients, invoices, audits, applications) and stores
  manual metrics in `os_scorecard`.
- **Rock / Goal review** — pulls quarterly goals from Command, on/off track.
- **To-do review** — last week's commitments.
- **IDS — Issues & Opportunities** — Identify, Discuss, Solve. A reorderable
  (drag) priority list; off-track scorecard items and missed initiatives can be
  dropped in; solved items move to a "solved this week" log.
- **Ingest meeting** button → the AI pipeline (tab 11 / section 5).

### 3. Initiatives
Cross-functional initiatives with owner, category (Media: YouTube / Instagram /
LinkedIn / X; Product; Delivery; Recruiting; Retention), status (on track /
behind / done), progress, and notes. Advisor-driven plans (e.g. an "LTV
expansion plan" from a mentor call) are first-class initiatives, tagged with
their `source`.

### 4. Team — the roster + scorecard
The "fantasy roster": every team member with role, region, status, individual
scorecard/KPIs, and a capacity/utilization bar. Surfaces gaps to fill and
automation opportunities. Read-mostly, manually maintained, linked to
Recruiting for open roles.

### 5. Success — customer / founder success
Client health, onboarding pipeline, retention, NPS, and CSM
assignments/capacity (the "scale 5 → 12 CSMs" view). Reuses existing
`clients`, `projects`, `client-health`, `onboarding` data; adds CSM capacity
and retention targets on top.

### 6. Recruiting — the leaderboard (your screenshot)
Recruiter/channel leaderboard by region: candidates, advanced, hired,
cost/hire, upfront cost, status (Onboarding, Looms Pending, Signing Today,
Call Mon 1:30, Intro Pending, …). Header KPIs: active channels, hired vs target,
cost per hire, est. total spend. Below it, a candidate pipeline (role, stage,
recruiter, region, notes). "Any business is only as strong as its recruitment."

### 7. Journey — the delivery playbook ("McDonaldize the delivery")
TMI's standardized client journey from audit → proposal → onboarding → system
build → delivery, rendered as a timeline of dated milestones, calls, and
delivered assets (the analog of the video's 75-day / 7-call / 60-asset
Velocity journey). Every email/asset is an "aha moment." Editable stages stored
in `os_journey_stages`; supports multiple journeys (e.g. Physical-economy build
vs Online build).

### 8. Flywheel
A one-page flywheel: build a great product → market the results → clients
spread the word → attract more clients of that caliber. Visual loop with a
metric on each stage, editable stage labels/notes.

### 9. Strategy
One-page company strategy: the value ladder (media → email list → workshops →
cohorts → core offer → software/book), current offers, and an **advisor log** —
the "talk to ~5 mentors a week" record (advisor, date, insights, action items).
Action items can be promoted into Initiatives or Command goals.

### 10. Vision
The centralized V2MOM / Benioff-style card: Mission, Vision, Values, Core Goals,
and 1 / 3 / 10-year targets — one screen everyone can see. "Build the operating
system for businesses that run without their owner."

---

## 3. Database schema (`supabase-os-schema.sql`)

All tables `public.os_*`, `created_at timestamptz default now()`, RLS off
(service-role API only), mirroring the existing schema conventions.

- `os_goals` — id, level (`quarter|month|week`), parent_id (self-FK), title,
  owner, status, sort, period_label, due_date.
- `os_subtasks` — id, goal_id FK, text, done bool, sort. (Progress = done/total.)
- `os_scorecard_metrics` — id, name, unit, target_value, direction
  (`higher|lower`), source (`manual|crm`), crm_key, sort.
- `os_scorecard_entries` — id, metric_id FK, week_of date, value.
- `os_wins` — id, text, author, week_of.
- `os_issues` — id, title, notes, status (`identify|discuss|solved`), sort,
  solved_at, origin (`manual|scorecard|initiative|ai`).
- `os_initiatives` — id, title, category, owner, status, progress int, notes,
  source.
- `os_team_members` — id, name, role, region, status, capacity_pct,
  scorecard jsonb, avatar_url, sort.
- `os_recruiters` — id, name, channel, region, candidates, advanced, hired,
  cost_per_hire, upfront_cost, status, sort.
- `os_candidates` — id, name, role, recruiter_id FK, stage, region, notes.
- `os_journey_stages` — id, journey, day_offset, title, type
  (`call|asset|milestone`), description, sort.
- `os_advisor_notes` — id, advisor, met_on date, insights, action_items.
- `os_meetings` — id, title, met_on, source (`fathom|manual`), transcript,
  summary, extracted jsonb, processed_at.
- `os_kv` — key (pk), value jsonb. Backs the singletons: `vision`, `flywheel`,
  `strategy_ladder`, `strategy_offers`.

Seed rows for vision/flywheel/strategy and a starter scorecard so the UI is
populated on first load.

---

## 4. API endpoints (`/api/os-*.js`)

Each follows the existing pattern: `requireAuth(req,res)` → method switch →
Supabase query → JSON. CRUD verbs: GET (list), POST (create), PATCH (update),
DELETE.

- `os-goals.js` (goals + nested subtasks)
- `os-scorecard.js` (metrics + entries; GET merges live CRM numbers for
  `source=crm` metrics)
- `os-wins.js`
- `os-issues.js` (incl. reorder via `sort`)
- `os-initiatives.js`
- `os-team.js`
- `os-recruiting.js` (recruiters + candidates)
- `os-journey.js`
- `os-strategy.js` (advisor notes + ladder/offers via os_kv)
- `os-vision.js` (os_kv)
- `os-flywheel.js` (os_kv)
- `os-meeting-ingest.js` (section 5)

Badge hook: extend `TMIAdmin._loadBadges()` to flag open off-track issues /
overdue goals on the Ops Machine nav item.

---

## 5. Fathom → Claude auto-update pipeline

Goal: record leadership/advisor calls on Fathom; the transcript flows into
Claude, which updates the Ops Machine so nobody asks "what did we commit to last
week?"

Flow:
1. **Ingress** — `/api/os-meeting-ingest.js` accepts a transcript two ways:
   (a) manual paste from the Level 10 tab, (b) a Fathom webhook (transcript or
   share URL). Webhook payload is verified by a shared secret env var.
2. **Async** — enqueue heavy processing through QStash so the webhook returns
   fast.
3. **Extraction** — call Anthropic (`@anthropic-ai/sdk`) with a structured
   tool/JSON-schema prompt that returns: `summary`, `wins[]`, `issues[]`
   (IDS candidates), `scorecard_updates[]` (metric → value), `initiative_updates[]`
   (title → progress/status), and `action_items[]` (→ Command goals). Model
   `claude-sonnet-4-6` for cost, with prompt caching on the system prompt.
4. **Review & apply** — store raw result in `os_meetings.extracted`. The Level
   10 tab shows a "Meeting digest — review & apply" panel; the user accepts/edits
   each suggested change before it writes to `os_wins`, `os_issues`,
   `os_scorecard_entries`, `os_initiatives`, `os_goals`. (Default to
   review-then-apply rather than silent auto-write, so the dashboard stays
   trustworthy. An "auto-apply" toggle can be added later.)
5. **Audit** — every applied change tagged `origin='ai'` with the meeting id.

New env vars: `ANTHROPIC_API_KEY`, `FATHOM_WEBHOOK_SECRET`. New dependency:
`@anthropic-ai/sdk`. (QStash already present.)

---

## 6. Build phases

**Build status — all 10 tabs + AI pipeline shipped (pending schema apply):**
- ✅ **Command** → `admin-dashboard.html` (goal ladder + subtasks + bars) · `os-goals`
- ✅ **Level 10** → `admin-reports.html#level10` (Wins, Scorecard w/ live CRM pulls,
  IDS reorder/solve, meeting digest) · `os-scorecard`, `os-wins`, `os-issues`
- ✅ **Initiatives** → `admin-plans.html#initiatives` · `os-initiatives`
- ✅ **Team roster** → `admin-team.html#roster` · `os-team`
- ✅ **Recruiting** → `admin-team.html#recruiting` (leaderboard + candidates) · `os-recruiting`
- ✅ **Success** → routed to `admin-clients.html#health` (existing client health/retention)
- ✅ **Journey** → `admin-onboarding.html#journey` (delivery timeline) · `os-journey`
- ✅ **Flywheel** → `admin-plans.html#flywheel` · `os-kv`
- ✅ **Strategy** → `admin-plans.html#strategy` (ladder, offers, advisor log) · `os-kv`, `os-advisors`
- ✅ **Vision** → `admin-plans.html#vision` · `os-kv`
- ✅ **Fathom → Claude** ingestion · `os-meeting-ingest` + Level 10 review/apply
- ✅ **"Ops Machine" sidebar group** (desktop + mobile) tying it all together
- ✅ Seed data: starter scorecard, the recruiting leaderboard, owner on roster

**To go live:** run `supabase-os-schema.sql` in Supabase, set `ANTHROPIC_API_KEY`
(and optional `FATHOM_WEBHOOK_SECRET`) in Vercel env, then merge to `main`.
- **Phase 2 — People.** Recruiting leaderboard (your screenshot) + Team roster +
  Success. `os-recruiting`, `os-team`; Success reuses existing CRM endpoints.
- **Phase 3 — Story.** Initiatives, Journey, Flywheel, Strategy (+ advisor log),
  Vision. `os-initiatives`, `os-journey`, `os-strategy`, `os-vision`,
  `os-flywheel`.
- **Phase 4 — AI pipeline.** `os-meeting-ingest`, Anthropic extraction, QStash
  async, Fathom webhook, Level 10 "review & apply" digest panel.
- **Phase 5 — Polish.** Nav badges, mobile layout, seed data, empty states,
  loading skeletons, and a quick pass against the design tokens.

Each phase ends with a commit to `claude/stoic-fermat-ZSmoU` (deploy is
`push origin main`, so nothing goes live until merged).

---

## 7. Open items / decisions to confirm before/while building

- **Real scorecard metrics + targets** — which weekly numbers and their goals.
- **Recruiting columns/statuses** — confirm the exact status labels and regions.
- **Vision/Strategy copy** — your actual mission, value ladder, and offers.
- **Auto-apply vs review** for AI meeting updates (plan defaults to review).
- **Fathom plan/webhook availability** — confirm Fathom can POST transcripts, or
  whether we ingest via the share URL / paste only at first.

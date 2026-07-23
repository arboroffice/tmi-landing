# TMI OS — 10x PRD

Product requirements to turn TMI OS from "AI features on a dashboard" into a
company you staff, measure, and run without you. Grounded in the current
architecture so it is buildable directly.

- **Status:** Draft for implementation
- **Source of strategy:** `docs/os-10x-plan.md`
- **Owner:** TMI

## Vision

Every business gets an AI team it hires, manages, and trusts. You give each
worker a target and a plain-language operating procedure; the company runs on a
weekly rhythm; one event ripples across departments; and you can ask the company
anything and get a cited answer. The owner supervises, does not operate.

## Success metrics

| Metric | Now | Target |
|---|---|---|
| Activated workers per tenant (on + acting) | ~1 | 3+ |
| Actions delivered / tenant / week | low | 25+ |
| % owners returning weekly (WAU/tenant) | — | 60% |
| Time to first real deliverable | ~1 min (firstWin) | keep < 2 min |
| Metrics running on live data | 0-2 | 5+ |

## Architecture we build on (already shipped)

- **Views** (`os/app.html`): command, pulse, coo, inbox, threads, tasks,
  workforce, workflows, departments, knowledge, brain, reports, activity,
  integrations, guardrails, team, plans, clients.
- **Workers:** `os_workers`, run via `_osrun.executeWorker`, actions delivered
  by `_osact`, gated by `_ospolicy` (Guardrails). Audit log `os_actions`.
- **COO:** `os2-ask` (grounded in metrics/workers/workflows/knowledge/tasks/
  goals/signals). **Pulse:** `os2-pulse` (`os_signals`). **Cron:** `os2-cron`,
  `os2-sync`.
- **Connectors:** Stripe/QuickBooks/Plaid/MCP/webhook/URL feeding `os_metrics`.
- **Dormant, to activate:** workflow engine `_osflow`/`os2-flow`, action log
  `os2-audit`, tool bridge `_ostools` (all `OS_ENABLE_LABS`-gated).

---

# EPIC 1 — Workers become a team you hired (Tier 1)

**Why.** TMI's promise is "AI workers that run your company," but today a worker
is a row with an on/off toggle. Make it a hire with a target, a procedure, and a
scoreboard. Highest feel-change per unit effort.

### F1.1 — Worker target / quota
- **Story:** As an owner, I set what each worker is responsible for hitting, so I
  can judge it like an employee.
- **Data:** `os_workers` add `target` (string, e.g. "40 invoices chased / month"),
  `target_metric` (optional metric key), `target_value` (number), `period`
  (`week`|`month`).
- **API:** extend `os2-crud` worker `FIELDS` with the new fields.
- **UI:** target field in the worker form; target shown on the worker card.
- **AC:** target persists, renders on card + profile, editable by manager+.

### F1.2 — Operating Procedure (plain-language SOP)
- **Story:** As an owner, I write in plain English how a worker should do its job,
  and it follows that every run (steal: Decagon AOPs).
- **Data:** `os_workers` add `procedure` (text, up to 4000).
- **Logic:** `_osrun.produce` injects the procedure into the worker's system/task
  prompt ("Follow this operating procedure exactly: …").
- **UI:** a large "Operating procedure" textarea in the worker form (voice mic
  already available on textareas). Seeded with a sensible default per role by
  `os2-intake`.
- **AC:** editing the procedure measurably changes the next run's output; visible
  on the profile page.

### F1.3 — Weekly scoreboard (output metering)
- **Story:** As an owner, I see what each worker delivered this week vs. its
  target, so the value is undeniable.
- **Data:** derive from `os_actions` (already stamped per worker) + `os_build_log`.
  No new writes; add an aggregate in `os2-state`: `worker_stats[worker_id] =
  { week: n, month: n, total: n, last_at }`.
- **API:** `os2-state` computes `worker_stats` from `os_actions` grouped by
  `worker_id` and time window (reuse the `getSpentToday` pattern).
- **UI:** each worker card shows "This week: 12 / 40" with a mini progress bar;
  profile page shows a 4-week sparkline.
- **AC:** counts match the activity log; updates within one refresh of an action.

### F1.4 — Worker profile page
- **Story:** As an owner, I open a worker like a team member's page: role,
  procedure, channels, targets, and its output history.
- **UI:** new `data-view="worker"` (or a modal) opened from a worker card:
  header (name, role, status, department), Operating Procedure, Channels it can
  act on, Target + scoreboard sparkline, recent deliverables (from `os_actions`/
  `os_outputs`), and Run now / Pause / Edit.
- **AC:** reachable from Workforce; shows real recent actions; actions link to
  the item they produced.

### F1.5 — Clean escalation as first-class inbox items
- **Story:** When a worker won't act on its own (Guardrails = approve), the ask
  lands in my inbox with the worker's reasoning and a one-click approve.
- **Data:** `os_outputs` already holds pending drafts; add `reason` (why it
  escalated) and `worker_id`.
- **Logic:** `_osrun`/`_osact` write the policy decision reason onto the staged
  output.
- **UI:** Inbox item shows "Ava wants to email Acme — waiting on you", the draft,
  the reason, Approve / Edit / Decline.
- **AC:** approving fires the real action through `_osact`; declining logs it.

### F1.6 — Voice channel (phase 2 within Epic 1)
- **Story:** A worker can place/receive calls (steal: 11x "Mike").
- **Dependency:** a connected phone provider (Twilio/RingCentral, already in the
  catalog + OAuth spine). Gate behind provider connection.
- **Scope:** outbound reminder/confirmation calls first; inbound later.
- **AC:** with a provider connected, a worker can complete a scripted call and log
  the outcome; without one, the channel shows "connect a phone provider."

---

# EPIC 2 — Linear-grade velocity (Tier 2)

**Why.** Make the OS feel instant and become a daily habit, not a dashboard you
forget.

### F2.1 — Command palette (Cmd-K)
- **Story:** I press Cmd-K and can jump to any view, run any action, or ask the
  COO, without the mouse.
- **UI:** global overlay bound to `⌘/Ctrl-K`. Fuzzy list of: views, "Run [worker]",
  "Add task/metric/worker", "Ask COO: …" (routes free text to `os2-ask`),
  "Connect a tool". Keyboard nav + Enter.
- **AC:** opens on shortcut and a top-bar button; every listed command executes;
  arrow/enter/escape work; `prefers-reduced-motion` respected.

### F2.2 — Triage inbox
- **Story:** Every inbound (lead, message, invoice, worker draft, Pulse signal)
  lands in Triage first, so nothing reaches the company unreviewed (steal:
  Linear triage).
- **Data:** add `triage_status` (`new`|`accepted`|`dismissed`) to the surfaced
  items (`os_outputs`, `os_threads`, high-severity `os_signals`, inbound leads).
- **UI:** the Inbox becomes a Triage queue: each item has Accept (route to a
  worker/task), Assign, Dismiss. A count badge in the nav.
- **AC:** new items default to Triage; accepting routes them; dismissing clears
  them; badge reflects the true unreviewed count.

### F2.3 — Operating cycle (Monday plan / Friday recap)
- **Story:** The company runs on a weekly rhythm — Monday the COO posts the plan,
  Friday it posts what the workers delivered.
- **Logic:** extend `os2-digest`/`os2-cron` to generate a Monday "plan" and a
  Friday "recap" from `worker_stats` + goals + Pulse, written by the COO
  (`os2-ask` briefing mode), stored in `os_reports` (`period: cycle`).
- **UI:** a "This week" strip on the command view (plan Mon-Thu, recap Fri-Sun);
  optional email via the existing digest sender.
- **AC:** the strip changes across the week; recap names real delivered numbers.

---

# EPIC 3 — The compound cascade (Tier 3)

**Why.** One event rippling across departments is TMI's true differentiator and
finally activates the dormant workflow engine.

### F3.1 — Event cascades (activate the workflow engine)
- **Story:** When "a client is won," Finance sets up billing, Ops opens a kickoff,
  CS creates the account, and the COO briefs me — automatically (steal: Rippling).
- **Data:** define **triggers** (`event` type: `client_won`, `invoice_overdue`,
  `lead_created`, `job_completed`, `metric_threshold`) and **cascade steps**
  (each = a worker action, a task, a metric update, or a notification). Store on
  `os_workflows` using the real `_osflow` structured step types (fix
  `os2-crud.js` coercion of steps to strings — the audit flagged this).
- **Engine:** wire `_osflow` to run on events; `os2-cron` resumes `waiting`/
  `resume_at` runs (audit flagged this missing). Emit events from the places
  they happen (a won deal, an overdue invoice from the finance sync, a new lead
  from ingest).
- **UI:** a cascade builder in the Workflows view — pick a trigger, add steps in
  plain language; a run history showing what fired.
- **AC:** a test trigger fires a multi-step cascade end to end; a `wait` step
  resumes on schedule; every step is logged and policy-gated.

### F3.2 — One company graph (single source of truth)
- **Story:** Customers, jobs, invoices, and metrics live in one place every worker
  and department reads and writes (steal: Rippling's single source of truth).
- **Data:** introduce lightweight entities (`os_customers`, `os_jobs`,
  `os_invoices`) or a generic `os_records{type,fields}` fed by connectors + intake;
  link workers/departments/metrics to them.
- **Scope:** start read-only from connectors (Stripe customers, QuickBooks
  invoices), then let workers write.
- **AC:** the COO and Finance worker answer from these entities; a cascade can act
  on them (e.g. "chase this invoice").

---

# EPIC 4 — Finance agent + cited company brain (Tier 4)

**Why.** Money is the most-watched number and the brain justifies the platform.
Both ride the connectors already shipped.

### F4.1 — Finance worker (proactive)
- **Story:** A finance worker watches the money and acts before I ask (steal: Ramp).
- **Behaviors:** flag overdue invoices, catch an unusual spend or a cash dip
  (compare to `os_metrics.history`), nudge on low runway, draft the monthly close.
- **Logic:** a specialized `produce` path in `_osrun` for `role: finance` that
  reads cash/revenue/invoice metrics + history and emits signals/tasks/drafts.
  Anomalies post to Pulse (`os_signals`).
- **AC:** with Plaid/Stripe/QuickBooks connected, it surfaces at least the overdue
  and cash-dip signals; money actions still route through Guardrails.

### F4.2 — Month close flow
- **Story:** One place to "close the month" — the finance worker drafts the recap
  (revenue, spend, cash movement, overdue) for approval.
- **UI:** a "Close the month" action in Reports; output stored in `os_reports`
  (`period: month`).
- **AC:** produces a real cited monthly summary from connected data.

### F4.3 — Cited COO answers (enterprise graph)
- **Story:** I ask the company anything and get an answer with sources (steal:
  Glean). "Runway is 7 months (bank + burn); at-risk client is Acme (overdue +
  no reply 20 days)."
- **Logic:** extend `os2-ask` context to include connector-sourced data + the
  company graph (F3.2), and require the answer to name sources; return a
  `citations[]` array the UI renders as chips.
- **AC:** answers include at least one real citation when data supports it; no
  fabricated sources.

### F4.4 — Agent audit log
- **Story:** Every worker action is auditable and worker procedures are versioned
  (steal: Glean governance).
- **Logic:** wire `os2-audit` (currently `OS_ENABLE_LABS`-gated) into the OS:
  write an audit entry on every fired action and every procedure edit; render in
  the Activity view.
- **AC:** the Activity view shows a permission-aware, timestamped action log;
  procedure changes show a diff/history.

---

## Data model summary (new fields / collections)

- `os_workers`: `+ target, target_metric, target_value, period, procedure`
- `os_outputs`: `+ reason, worker_id, triage_status`
- `os_threads` / `os_signals`: `+ triage_status`
- `os_workflows`: structured `steps[]` with `{type: worker|wait|task|metric|notify|branch}` (stop stringifying steps)
- new (Tier 3): `os_customers` / `os_jobs` / `os_invoices` or generic `os_records`
- derived (no storage): `worker_stats` (in `os2-state`)

## API summary (new / changed)

- `os2-state`: add `worker_stats`, connector-fed graph reads, `triage` counts.
- `os2-crud` (workers): add new fields; **fix** structured workflow steps.
- `os2-ask`: `citations[]`; graph-aware context.
- `os2-worker` / new `os2-triage`: accept/assign/dismiss.
- `os2-flow` + `os2-cron`: event triggers + `waiting` resume (activate `_osflow`).
- `os2-cron` / `os2-digest`: Monday plan / Friday recap (cycle).
- `os2-audit`: un-gate for the OS and write on every action.

## Phasing

1. **Epic 1 (F1.1-F1.5)** — workers become a measured team. *Start here.*
2. **Epic 2 (F2.1-F2.3)** — palette, triage, cycle. Premium feel + habit.
3. **Epic 3** — cascades + graph. The differentiator.
4. **Epic 4** — finance agent + cited brain + audit.
5. **F1.6 voice** — when a phone provider is connected.

## Non-goals (for now)

- Building our own model or a general no-code canvas (we orchestrate Claude).
- Replacing vertical systems (ServiceTitan, QuickBooks); we sit on top and act.
- Consumer/self-serve GTM changes (services-first positioning stands).

## Risks & mitigations

- **Claude cost per tenant** grows with workers/cascades → enforce per-tenant
  spend caps (already built) and cap cascade depth; meter in `worker_stats`.
- **Trust** of autonomous action → everything stays behind Guardrails; escalation
  and the audit log make it legible.
- **Workflow engine complexity** (Epic 3) → ship Epics 1-2 first; stage cascades
  behind a flag; start read-only for the graph.

## Acceptance for "10x done"

A new tenant, an hour in, has 3 named workers with targets and procedures, a
weekly scoreboard showing real delivered work, a triage inbox catching everything,
a Monday plan from the COO, and — with a bank/Stripe connected — a finance worker
flagging the first overdue invoice. The owner supervises; the company runs.

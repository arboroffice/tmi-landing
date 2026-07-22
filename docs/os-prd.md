# TMI OS — Product Requirements Document

**From an intelligence layer to a company that runs itself, for many companies.**

Owner: Mia · Status: Draft v1 · Last updated: 2026-07-22

---

## 1. Vision

TMI OS is the operating system a business runs on. An owner brings their company in, lays out how it works, and TMI builds the backend so the OS actually runs it: the workforce does the work, watches the numbers, talks to customers, moves money and jobs through the pipeline, and only pulls in the owner when a human decision is genuinely required. One platform runs many companies at once, each fully isolated, each getting more capable over time, each measured by one number: how much of the business runs without the owner.

The test we are building toward: **an owner can take a two-week vacation and the company keeps operating, on the OS, without them.**

---

## 2. Honest current state (what is live today)

The multi-tenant foundation and the intelligence layer are real and deployed. What is NOT yet real is the OS *operating* the business end to end.

### What works now
- **Multi-tenant core.** Tenant auth (`_tenant-auth`, JWT kind `tenant`), every read/write scoped by `tenant_id`, roles owner/manager/viewer, team seats and invites (`os2-team`, `os2-join`). Firestore data layer (`_db`).
- **Command center & score.** Metrics with history, the Company Intelligence Score and Owner Dependency reading (`_osscore`), certification threshold.
- **AI COO.** Ask + morning briefing (`os2-ask`), can propose and apply changes to the company objects.
- **Digital workforce.** Workers that produce real work product via Claude (`_osrun`), run on a cadence via the daily sweep (`os2-cron`), each with an autonomy setting (read / approve / auto).
- **Action layer.** Approved worker output can actually send email/SMS (`_osact`, Resend/Twilio) under a policy gate (internal auto-files, external waits for approval unless autopilot is on), with a permanent audit trail (`os_actions`).
- **Pulse.** Agentic oversight (`os2-pulse`): reads the whole company daily, returns ranked signals, each with one action the OS can take (create task / run worker).
- **Goals.** Targets linked to metrics, tracked live on the command center.
- **Build with TMI.** Client files a build request; TMI fulfills from the admin console (`tmi-clients`), can provision workers/metrics/etc into the tenant, and wire data connections (`os_connections`) that go live when data flows through `os2-ingest`.
- **Data in.** Any tool can push metric values via the ingest key. Live metrics feed everything.
- **Notifications & digest.** Go-live emails (`_osmail`), weekly digest (`os2-digest`).
- **TMI side.** Client OS console, Flywheel dashboard, Proof Engine (auto-fires at certification), content auto-publish.

### The blunt gap
Today the OS is an **intelligence and drafting layer**. It can see, score, advise, draft, and send a message. It cannot yet:

1. **Read and write the company's real systems.** It has no connectors to QuickBooks, ServiceTitan, Jobber, Stripe, Google Workspace, a CRM, a calendar, inventory. Data only arrives if someone pushes it; nothing flows back out into the tools the business actually runs on. A worker cannot create an invoice, book a job, update a customer record, or order a part.
2. **Receive inbound.** A company runs on inbound: calls, texts, emails, web leads, form fills. The OS can only send. There is no shared inbox, no phone/SMS number, no inbound email, no web-form capture, no lead routing.
3. **Execute a process end to end.** Workflows are descriptive text, not an executable engine. There is no "when X happens, do step 1, then 2, branch on condition, hand to worker, wait for approval, continue."
4. **Remember.** Workers get a fresh snapshot each run. There is no per-customer history, no threads, no durable memory an employee would have.
5. **Run reliably at company-scale.** No retries, escalation paths, spend limits, per-connector credentials vault, SLAs, or observability that a business would trust with live operations.

Everything below is the plan to close that gap.

---

## 3. Product principles

1. **The org is the model.** A company is departments, each with a job, workers, metrics, goals, SOPs, and processes. The OS should mirror a real org, not a flat list of tools.
2. **Read before write; approve before act.** Every outward or irreversible action is governed by policy: autonomy level, spend limits, and an audit trail. Autopilot is earned per worker, per action type.
3. **Grounded, never invented.** Workers act only on the company's real data, knowledge, and connected systems. No invented numbers, contacts, or outcomes.
4. **Owner dependency is the scoreboard.** Every feature is judged by whether it moves work off the owner's plate safely.
5. **One platform, many companies, hard isolation.** No tenant can ever see or touch another's data or credentials.
6. **Managed, not DIY.** The client specifies; TMI builds the backend. The OS is the shared workspace, not a self-serve toolbox.

---

## 4. The operating model

How the OS runs a company, as a coherent structure (most of this is net-new):

- **Departments** (`os_departments`): Sales, Operations, Finance, Customer Service, Marketing, People. Each owns workers, metrics, goals, SOPs, and processes. The command center rolls up by department.
- **Workers as employees**: a role, a job, the systems they can touch, a memory, an autonomy policy, and an escalation path. They receive work (from inbound, a schedule, a workflow, or Pulse), do it against real systems, and log everything.
- **Systems** (`os_integrations`): authenticated connections to the tools the business runs on, with read and write scopes. Credentials live in a per-tenant secrets vault, never in the tenant document.
- **Channels** (`os_channels`): the phone number, SMS, email inbox, and web forms the company receives on. Inbound lands in a shared **Threads** inbox that workers operate.
- **Processes** (`os_workflows`, made executable): triggers, steps, branches, worker hand-offs, approvals, waits. The workflow engine runs them.
- **Memory** (`os_memory`, `os_threads`): durable customer/vendor/entity records and conversation threads workers read and append to.
- **Governance**: policy per worker and per action type, spend limits, approvals, and one audit log for everything the OS did.

---

## 5. Requirements by pillar

Priorities: **P0** = required before the OS can run any real operation. **P1** = required to run a company unattended. **P2** = scale, polish, breadth.

### A. Integrations & Actions — the tool layer (P0)
The single most important gap. Workers must read and write the real systems.
- **A1 (P0).** Connector framework: a uniform way to define a connector (auth, read scopes, write scopes, rate limits), a per-tenant **secrets vault** (`os_secrets`, encrypted, never returned to the client), and an OAuth flow surface.
- **A2 (P0).** First connectors by TMI's core verticals: accounting (QuickBooks), field service (ServiceTitan or Jobber), payments (Stripe), calendar + email (Google Workspace), messaging (Slack), a spreadsheet fallback (Google Sheets), and a generic webhook/HTTP action.
- **A3 (P0).** **Tool calls for workers.** Workers use Claude tool-use to invoke connector actions (create invoice, book job, update contact, send calendar invite, post to Slack) as real, logged, reversible-where-possible operations, gated by policy.
- **A4 (P1).** Two-way metric sync: connected systems push KPIs in *and* the OS writes back (e.g. mark an invoice paid).
- **A5 (P1).** Connector health monitoring, token refresh, and failure surfacing into Pulse.

### B. Inbound & Omnichannel (P0)
A company that can only send is a broadcaster, not an operator.
- **B1 (P0).** Provision a phone number + SMS per tenant (Twilio), an inbound email address, and embeddable web forms.
- **B2 (P0).** **Threads inbox** (`os_threads`, `os_messages`): every inbound conversation lands here, assigned to a department/worker, with full history.
- **B3 (P0).** Inbound routing: a rule/worker decides who handles each new message and what to do (draft reply, book, escalate).
- **B4 (P1).** Workers draft/respond in-thread under policy; autopilot can reply to defined intents automatically.
- **B5 (P1).** Voice: transcribe inbound calls, summarize, create follow-ups; later, an AI receptionist that answers and books.
- **B6 (P2).** Additional channels: web chat widget, WhatsApp, social DMs.

### C. Workforce depth (P0–P1)
- **C1 (P0).** **Memory.** Workers read and write durable context: customer records, prior threads, prior outputs. A worker run includes relevant history, not just a snapshot.
- **C2 (P0).** **Tools per worker.** Each worker is granted specific connectors/actions and cannot exceed them.
- **C3 (P1).** **Escalation.** When a worker is unsure or policy blocks it, it opens a task/thread for a human with a clear ask, instead of guessing or stalling.
- **C4 (P1).** Reliability: retries with backoff, idempotency on write actions, dead-letter surfacing, run history per worker.
- **C5 (P1).** Worker templates by role (dispatcher, collections, front desk, estimator, bookkeeper) that provision with the right tools, SOPs, and policy pre-set.
- **C6 (P2).** Worker-to-worker handoff and a lightweight "team" of workers collaborating on one job.

### D. Workflow engine — executable processes (P1)
- **D1 (P1).** A real engine: trigger (inbound / schedule / metric threshold / manual) → ordered steps → each step is a worker action, a connector action, a wait, or an approval → branch on conditions.
- **D2 (P1).** Durable runs (`os_workflow_runs`): state, current step, history, retriable, visible in the OS.
- **D3 (P1).** The COO composes workflows from natural language ("when a lead comes in, qualify, book, and send the intake form") into an editable process.
- **D4 (P2).** A visual builder for owners/TMI to edit processes.

### E. Departments & org structure (P1)
- **E1 (P1).** `os_departments`; workers, metrics, goals, SOPs, processes all belong to a department.
- **E2 (P1).** Command center rolls up by department; each department has its own health, goals, and Pulse.
- **E3 (P2).** Org chart view: the AI org, who does what, what is automated vs owner-held.

### F. Governance, guardrails & audit (P0–P1)
- **F1 (P0).** Policy model: per worker and per action type (email, SMS, payment, external write) → auto / approve / never, plus **spend limits** (dollar caps per action and per day) and **rate caps**.
- **F2 (P0).** One **audit log** (`os_audit`) of every action the OS took, who/what triggered it, inputs, result, reversibility. Already partly present (`os_actions`, `os_build_log`); unify and expand.
- **F3 (P1).** Approvals routing by amount/risk to the right role. Owner-only for money above a threshold.
- **F4 (P1).** Kill switch: pause a worker, a department, or the whole tenant's autonomy instantly.
- **F5 (P2).** Policy simulation ("what would autopilot have done this week") before turning it on.

### G. Onboarding & provisioning (P1)
- **G1 (P1).** Deep guided setup: connect systems, import customers/history, define departments, set policies. Current intake (`os2-intake`) is a starting point.
- **G2 (P1).** **Industry templates**: an HVAC company, a plumbing company, a med spa each provision a full starting org (departments, workers with tools, SOPs, metrics, goals, processes) TMI then tunes.
- **G3 (P1).** Data import: bring in customers, jobs, invoices from the connected systems so memory starts full, not empty.
- **G4 (P2).** A guided "first week to first automation" success path with milestones.

### H. Multi-company operations — the TMI fleet (P1)
- **H1 (P1).** Fleet view (extends `admin-flywheel` / `admin-os-clients`): every company's health, autonomy %, open escalations, connector status, SLAs, on one screen.
- **H2 (P1).** Cross-company build queue and provisioning from templates (extends Build with TMI).
- **H3 (P1).** Per-tenant isolation guarantees documented and tested; secrets are per-tenant and inaccessible cross-tenant.
- **H4 (P2).** TMI-side ops workers: agents that help TMI run and expand the client base (onboarding, health, expansion), feeding the flywheel.

### I. Data, reporting & financials (P1–P2)
- **I1 (P1).** Real financial view pulled from accounting + payments: cash position, AR/AP, P&L snapshot, per-job costing where available.
- **I2 (P1).** Report builder the workforce fills (already have `os_reports`); make them scheduled and system-fed.
- **I3 (P2).** Benchmarks: how a company compares to peers on the platform (anonymized).

### J. Reliability & observability (P1)
- **J1 (P1).** Job queue for worker/workflow/connector runs with retries, backoff, idempotency (current cron sweep is synchronous and capped; move to a durable queue).
- **J2 (P1).** Per-tenant run logs and error surfacing into Pulse and the TMI fleet view.
- **J3 (P2).** Uptime/SLA tracking per connector and per tenant.

### K. Security, isolation & compliance (P0–P2)
- **K1 (P0).** Secrets vault for connected-system credentials, encrypted at rest, per-tenant, never returned to any client.
- **K2 (P0).** Tenant isolation review and tests; every new collection scoped and verified.
- **K3 (P1).** PII handling policy, data retention, per-tenant export and delete.
- **K4 (P2).** SOC 2 path, access logging, pen-test.

### L. Billing & plans (P2)
- **L1 (P2).** Metering (workers, actions, connectors, messages) and subscription tiers tied to `plan`.
- **L2 (P2).** Usage limits and upgrade prompts by plan.

### M. Mobile & field (P2)
- **M1 (P2).** Owner mobile: approvals, threads, Pulse, command center on a phone (PWA, mirroring the city-reps app pattern).
- **M2 (P2).** Field/crew surface where relevant.

---

## 6. Data model additions

New collections (all `tenant_id`-scoped unless noted):
- `os_departments` — {name, mandate, sort}
- `os_integrations` — {provider, status, scopes, health, last_sync} (credentials NOT here)
- `os_secrets` — encrypted per-tenant credentials, server-only, never returned
- `os_channels` — {type: phone/sms/email/form, address, status}
- `os_threads` — {channel, subject, contact_id, department_id, worker_id, status, last_at}
- `os_messages` — {thread_id, direction, body, author, created_at}
- `os_memory` / `os_contacts` — durable customer/vendor/entity records
- `os_workflow_runs` — {workflow_id, state, step, history, status}
- `os_audit` — unified action log (supersedes/absorbs `os_actions` semantics)
- `os_policies` — {scope: worker/dept/tenant, action_type, mode, limits}

Extend existing:
- `os_workers` — add `department_id`, `tools` (granted connectors/actions), `memory_scope`, `escalation`.
- `os_workflows` — add executable `steps` (typed), `trigger`, `status`.
- `os_metrics`, `os_goals`, `os_reports` — add `department_id`.

---

## 7. Phased roadmap

### Phase 0 — Today (done)
Multi-tenant core, command center, score, COO, workforce with cadence, action layer (send), Pulse, Goals, Build-with-TMI, data-in connections, admin fleet/flywheel/proof/publish.

### Phase 1 — "The OS can operate" (P0)
Goal: a worker can do a real job in a real system, and the company can receive.
- Connector framework + secrets vault (A1, K1)
- First 3 connectors: accounting, field-service, calendar/email (A2)
- Worker tool-use to take real actions, policy-gated (A3, C2, F1)
- Inbound: phone/SMS/email + Threads inbox + routing (B1–B3)
- Worker memory v1 (C1)
- Unified audit + kill switch (F2, F4)
**Done when:** a booked job in ServiceTitan creates the invoice in QuickBooks and texts the customer, initiated by a worker, logged and reversible, with the owner only approving anything over a set dollar amount.

### Phase 2 — "The OS runs unattended" (P1)
Goal: departments, executable processes, escalation, reliability.
- Workflow engine + durable runs (D1–D3)
- Departments + rollups (E1–E2)
- Escalation + retries + job queue (C3–C4, J1–J2)
- Inbound autopilot for defined intents (B4)
- Financial view from connected systems (I1)
- Deep onboarding + industry templates + data import (G1–G3)
- Fleet view v2 + isolation tests (H1, H3, K2)
**Done when:** an owner takes two weeks off; inbound is handled, jobs move, invoices go out and get chased, escalations wait in a clear queue, and the weekly digest shows the company ran.

### Phase 3 — "The best, at scale" (P2)
Voice/receptionist (B5), more connectors and channels (A/B breadth), visual workflow builder (D4), benchmarks (I3), billing/metering (L), mobile (M), SOC 2 path (K4), TMI-side growth workers (H4).

---

## 8. Definition of success

The OS "runs an intelligent company" when, for a real client:
1. **Inbound is handled** without the owner (measured: % of threads resolved with no owner action).
2. **Work executes in real systems** (measured: real actions/week taken in connected tools).
3. **Money moves correctly** (invoices created, sent, chased, reconciled) with zero invented figures.
4. **Escalations are clean** — the owner gets a short, correct queue of only what needs a human.
5. **Owner Dependency drops** quarter over quarter and stays down.
6. And it holds for **N companies at once**, fully isolated, from one TMI fleet view.

---

## 9. Key risks

- **Write actions are dangerous.** A wrong invoice or a mistaken text to a customer is real harm. Mitigation: policy gate, spend limits, idempotency, reversibility, audit, kill switch, staged autopilot.
- **Connector sprawl.** Every vertical wants different tools. Mitigation: a uniform connector framework + a generic HTTP/webhook action so TMI can wire anything before a native connector exists.
- **Isolation failure is existential.** One tenant seeing another's data or credentials ends the product. Mitigation: per-tenant secrets vault, scoped queries by default, isolation tests as a release gate.
- **Reliability trust.** Owners will not hand over operations to something flaky. Mitigation: durable queue, retries, observability, SLAs before selling unattended operation.
- **Scope.** This is a large build. Mitigation: Phase 1 is deliberately the smallest slice that proves "the OS operated a real system," end to end, for one vertical.

---

## 10. Open questions for Mia

1. **First vertical to go deep on?** (HVAC / plumbing / med spa / oil-and-gas services) — it sets the first native connectors.
2. **First systems to connect?** Most likely accounting + field-service + calendar. Confirm the exact tools your target clients already run on.
3. **Autonomy appetite.** Where should the default line sit between auto and approve for external actions and for money? (Current default: internal auto, external approve.)
4. **Build vs buy for inbound voice** (AI receptionist) — Phase 1 (transcribe/route) or wait to Phase 3 (answer/book)?
5. **Billing model** so metering is designed for the right plan boundaries.

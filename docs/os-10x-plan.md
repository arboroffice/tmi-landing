# 10x TMI OS — Features to steal from the best startups

Research on the companies defining the two categories TMI lives in — "AI does the
work" and "one system to run the company" — and exactly which of their signature
features to install into TMI, mapped to the OS we already have (command center,
AI workers, guardrails, COO, Pulse, departments, company brain, integrations).

The through-line: TMI's pitch is "the company that runs without you." The best
startups have each nailed one piece of that. Steal the piece, wire it to the
spine we built.

---

## 1. 11x / Artisan — "hire an AI employee, not a tool"

**What they do.** 11x sells autonomous AI SDRs ("Alice," and "Mike," a voice
agent that holds 5-minute outbound calls) with a *quota*, not a seat. Artisan's
"Ava" builds lists, enriches, writes, sends, and handles replies on autopilot.
The whole category reframed software as *headcount you hire*.

**The signature move.** A worker is a hire with a **name, a job, a quota, and a
scoreboard** — you manage it like an employee, not configure it like an app.

**Install into TMI.**
- Give every AI worker a **target/quota** ("chase 40 invoices/mo", "book 8 calls")
  and a **weekly scoreboard** of what it actually did vs. the target. We already
  log actions; surface them as an employee scorecard.
- A **worker profile page** (like a team member): role, operating procedure,
  channels it can act on, this week's output, lifetime output.
- A **voice channel** for workers (11x's "Mike") — inbound/outbound calls via a
  connected phone provider (Twilio/RingCentral are already in the catalog).

**Impact: very high** (it's TMI's core promise made tangible). **Effort: medium.**

---

## 2. Rippling — the compound cascade

**What they do.** The only platform unifying HR + IT + Finance on one source of
truth, where **one action cascades across every department**: hire someone and
Rippling provisions payroll, apps, a laptop, and finance access in one click.
Their thesis ("the compound startup") is literally TMI's thesis.

**The signature move.** **One event ripples across the whole company automatically.**

**Install into TMI.**
- **Event cascades**: "when a client is won" → Finance sets up billing, Ops opens
  a kickoff, CS creates the account, the COO briefs you. One trigger, many
  cross-department actions. This is the "intelligent company" made real — and it
  finally activates the workflow engine the audit flagged as inert.
- **One company graph**: a single source of truth every worker and department
  reads and writes (customers, jobs, invoices, metrics), instead of siloed lists.

**Impact: very high** (this is the differentiator). **Effort: high** (it's the
workflow engine + a data model), but stageable.

---

## 3. Decagon / Sierra / Lindy — Agent Operating Procedures

**What they do.** Enterprise AI support agents built around **Agent Operating
Procedures (AOPs)** — plain-language rules a manager edits without code that
govern how the agent behaves; the agent reads the full knowledge base, takes
real action (refund, cancel, upgrade), and **escalates cleanly** when it
shouldn't act. Lindy lets you describe an outcome + a trigger and the agent
figures out the how.

**The signature move.** **Every worker runs on a plain-language operating
procedure you can edit, and escalates cleanly.**

**Install into TMI.**
- Give each worker an **Operating Procedure** field: a plain-language SOP ("how to
  chase an invoice: wait 30 days, send a friendly note, then a firm one, then flag
  me") that the worker follows on every run. Editable by the owner, no code.
- **Clean escalation** already half-exists via Guardrails (approve/deny). Make the
  escalation visible as a first-class inbox item with the worker's reasoning.
- **Outcome tracking**: resolved / deflected / escalated counts per worker.

**Impact: high** (makes autonomy trustworthy and legible). **Effort: medium.**
Pairs perfectly with the Guardrails work already shipped.

---

## 4. Ramp — the finance agent

**What they do.** Ramp's agents handle approvals, **flag fraud and policy
violations**, research and score vendors, run procurement with sign-off gates,
and **close the books** — moving finance from reactive to proactive. Now at a
$44B valuation on exactly this.

**The signature move.** **A finance agent that watches the money and acts before
you ask.**

**Install into TMI.** (We just wired Plaid + Stripe + QuickBooks, so the data is
there.)
- A **Finance worker** that proactively: flags overdue invoices, catches unusual
  spend or a cash dip, nudges on low runway, and drafts the monthly close.
- **Approval gates on money** already exist (spend limits). Add a "close the
  month" flow and an anomaly signal into Pulse.

**Impact: high** (money is the most-watched number). **Effort: medium** — mostly
new worker behaviors on top of the connectors we built.

---

## 5. Linear — velocity, command palette, triage, cycles

**What they do.** The gold standard for product-tool UX: **keyboard-first**,
a **Cmd-K command palette**, a **Triage inbox** (nothing hits the backlog
unreviewed), and **Cycles** (a weekly operating rhythm). People love it because
it feels *instant*.

**The signature move.** **Run the whole system by keyboard, and nothing slips
through unreviewed.**

**Install into TMI.**
- **Cmd-K command palette**: run any view, action, or COO question from one bar.
  This alone makes the OS feel 10x more premium and fast.
- **Triage inbox**: every inbound (lead, message, invoice, worker draft) lands in
  Triage first — accept / assign / dismiss — so nothing reaches the company
  unreviewed. TMI has an inbox; make it a triage flow.
- **Operating cycle**: the company runs on a weekly rhythm — a Monday plan from
  the COO, a Friday recap of what the workers delivered. Turns the OS into a
  habit, not a dashboard you forget.

**Impact: high** (this is what makes it feel like a $100M product). **Effort:
medium** for the palette + triage; low for cycles (the COO already briefs).

---

## 6. Glean — the company brain as an enterprise graph

**What they do.** An **Enterprise Graph** that unifies all connected-app data, an
**assistant that answers any question from it with citations**, deep research,
**agent governance + version control**, and permission-aware audit trails.

**The signature move.** **Ask your company anything and get a cited answer from
everything it's connected to.**

**Install into TMI.**
- Upgrade the **COO + Company Brain** to answer from the *unified* connected data
  (bank, Stripe, QuickBooks, CRM, MCP servers) with **citations** — "runway is 7
  months (source: bank + burn), your at-risk client is Acme (source: overdue
  invoices + no reply in 20 days)."
- **Agent governance**: versioned worker procedures + an audit log of every action
  (we have os_audit, currently gated — wire it here).

**Impact: high** (this is the "brain" that justifies the whole platform).
**Effort: medium-high** — the connectors feed it; the retrieval + citation layer
is the build.

---

## Honorable mentions (one line each)

- **Gong / Fireflies** — record and mine customer calls; a worker that listens and
  extracts action items. (Trades + agencies live on calls.)
- **Vanta** — an "operating trust / readiness score" the company earns, like the
  Intelligence Score but for controls.
- **Superhuman / Attio** — obsessive speed + polish; informs the Linear-style pass.
- **Retool** — let owners spin up a custom internal view for their odd workflow.

---

## The 10x roadmap (prioritized)

**Tier 1 — Make workers feel like a team you hired** (11x + Decagon)
Quota + operating procedure + weekly scoreboard + worker profile pages. This is
the smallest change with the biggest shift in how the whole product *feels*:
from "AI features" to "my AI staff." Start here.

**Tier 2 — The command palette + triage + cycle** (Linear)
Cmd-K, a triage inbox, and a Monday-plan/Friday-recap rhythm. Makes it feel
premium and turns it into a daily habit.

**Tier 3 — The compound cascade** (Rippling)
One event ripples across departments. The true differentiator, and it activates
the dormant workflow engine. Bigger build; stage it after Tier 1-2 make workers
real.

**Tier 4 — The finance agent + cited company brain** (Ramp + Glean)
Proactive money-watching and an ask-anything brain, both riding the connectors
we just shipped.

Recommendation: build **Tier 1 first** — it's the highest ratio of "changes how
the product feels" to effort, and everything else (cascades, scoreboards, the
brain) gets more powerful once workers are real, measured employees.

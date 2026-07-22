# TMI OS — The best agentic intelligent business platform on the planet

**Research and strategy. Horizontal: every business, no vertical.**

Owner: Mia · Status: Draft v1 · 2026-07-22

This is the companion to `os-prd.md`. The PRD says how to make the OS *operate* a company. This says what makes it the *best*, and why going after every business is the right call, not a compromise.

---

## 1. The one-paragraph thesis

The agentic market has split into two camps and left the most valuable position empty. On one side, enterprise platforms (Salesforce Agentforce, Microsoft Copilot, ServiceNow) bolt agents onto a CRM or Office suite: powerful, but heavy, technical, and priced for the enterprise. On the other, horizontal builders (Lindy, Gumloop, Zapier, Relay, Cassidy) hand the owner a toolkit to *build their own* agents and workflows. Both miss the same person: the owner of a normal business who has no technical team, no time to assemble agents, and a pile of messy tools. TMI OS is the only one that says "you tell us how your business works, we build and run the whole thing." That is the empty position, and it is the biggest one. Horizontal is not a compromise; it is the wedge.

---

## 2. What the research says (2026)

- **Agentic AI has crossed into production.** The defining enterprise trend is the move from prompt-driven copilots to autonomous agents that "plan tasks, call tools, update business systems, and escalate exceptions." Salesforce reports 29,000 Agentforce deals; Microsoft reports 160,000 orgs running 400,000+ custom agents. The agentic market is projected to grow from ~$7.8B to ~$52B by 2030, and Gartner expects 40% of enterprise apps to embed agents by end of 2026. The organizations succeeding are cutting operating costs 35-40%.
- **The winners "act," the losers "assist."** The clearest line in the research: Agentforce acts, Copilot assists. Value accrues to systems that take the action, not ones that draft and wait.
- **SMB adoption is blocked by skills and complexity, not desire.** Across verticals, 50-70% of businesses cite lack of AI skills as the primary barrier; ~47% cite integration complexity and data quality; cost unpredictability and legacy systems compound it. The emerging winning class is "built around how small businesses actually operate, assumes no technical team and no lengthy onboarding, and fits the messy, improvised way small teams really work."
- **Interoperability standardized on MCP.** MCP is now "the USB-C for AI," implemented on 10,000+ servers with 97M+ SDK downloads. MCP is the vertical (agent-to-tool/data) standard; A2A is the horizontal (agent-to-agent) standard.
- **Reliability is an architecture, not a prompt.** The production playbook: observability and evals built in from day one, layered guardrails matched to business risk (PII, prompt injection, hallucination), external telemetry that does not trust the agent's self-report, and a closed improvement loop where eval results feed back into the system.
- **Trust is table stakes at the top.** The serious horizontal players (e.g. Cassidy) lead with SOC 2 Type II, GDPR, and HIPAA. To serve *every* business, including regulated ones, compliance is a feature, not paperwork.

Sources are listed at the end.

## 3. What this means for TMI

The horizontal decision changes three things:
1. **We cannot hand-build a connector for every business's tools.** A plumbing shop runs on different software than a law firm. The connector strategy must be a standard, not a catalog. (See Bet 1: MCP.)
2. **Our wedge is "done-for-you," and that is defensible.** Every barrier the research names (skills gap, integration complexity, onboarding friction) is precisely what the DIY builders force back onto the owner and what TMI removes. The managed model is not a service cost to minimize; it is the product.
3. **The scoreboard is the category.** No competitor sells "how much of your business runs without you." Owner Dependency and the Company Intelligence Score are a metric we can own the way a credit score is owned. (See Bet 10.)

---

## 4. The ten bets to be best-in-class

Priorities: **P0** now, **P1** next, **P2** scale. Each ties to what TMI already has.

### Bet 1 (P0) — MCP as the connector standard. The single biggest unlock.
Make the connector framework MCP-native. Instead of writing QuickBooks, ServiceTitan, and Google connectors by hand, the OS speaks MCP and instantly reaches the thousands of servers the ecosystem already publishes, plus any tool a business already uses. This is the only connector strategy that scales to *every* business.
- **Have:** `_osconnectors` (framework + generic HTTP + live Stripe/Slack), the secrets vault, the worker tool bridge (`_ostools`).
- **Add:** an MCP client layer so a connector can be "any MCP server," per-tenant MCP server registration (URL + credentials in the vault), and auto-mapping of an MCP server's tools into worker tool-use. Keep the native connectors as fast paths; MCP as the universal fallback.
- **Why it wins:** turns "we support 6 tools" into "we support whatever you run on," and rides an ecosystem standard instead of fighting it.

### Bet 2 (P0) — The company brain that learns (semantic memory + retrieval).
Workers should recall the right customer, policy, and past decision at the moment of acting, not receive a flat snapshot.
- **Have:** `os_knowledge`, `os_contacts`, `os_threads`, `_osmemory.recall`.
- **Add:** embeddings + vector retrieval over knowledge, threads, and past outputs; inject the top-k relevant memories into every worker run and COO answer; write outcomes back so the brain compounds.
- **Why it wins:** the research names memory and retrieval as the core of statefulness and the main lever against hallucination.

### Bet 3 (P1) — The COO as orchestrator (plan, delegate, verify).
Give a business a goal; the COO decomposes it into a plan, assigns the right workers, runs the steps, verifies the result, and escalates only the exceptions.
- **Have:** the COO (`os2-ask`), the workflow engine (`_osflow`), Pulse, workers.
- **Add:** a planner that turns a goal or a Pulse signal into a multi-step plan across workers (compose a workflow automatically), worker-to-worker handoff (A2A-style), and a verification pass before anything external commits.
- **Why it wins:** multi-agent orchestration is where value concentrates in 2026; "one agent that drafts" is commodity.

### Bet 4 (P1) — Observability, evals, and the improvement loop.
Every worker run and action is traced; quality is measured on real traffic; results feed back into prompts, memory, and policy.
- **Have:** `os_audit`, `os_build_log`.
- **Add:** structured traces per run (inputs, tools, decisions, outcome), an eval harness that scores outputs and flags regressions, and a weekly "where the OS was wrong and what changed" loop surfaced to TMI and, in summary, to the client.
- **Why it wins:** the production playbook says observability and a closed loop are what separate teams that scale autonomy from teams that stall.

### Bet 5 (P1) — Layered guardrails matched to risk.
Accuracy first, then guardrails sized to the stakes.
- **Have:** the policy engine (`_ospolicy`) with spend limits and a kill switch, the approve/auto gate.
- **Add:** content guardrails (PII detection and redaction, prompt-injection detection on inbound, hallucination checks on outbound), and mandatory verification for high-stakes actions (money over a threshold, first message to a new customer).
- **Why it wins:** to act on a real business you must be safe by construction, not by hope. This is also a sales unlock (owners trust it).

### Bet 6 (P1) — Reliability by design (durable queue + resume).
Move worker, workflow, and connector runs onto a durable job queue with retries, backoff, idempotency on writes, and a resume cron for waiting workflows.
- **Have:** synchronous, capped cron sweeps; the workflow engine already models `wait`/`resume`.
- **Add:** a real queue so nothing is lost, failures retry, and long processes survive.
- **Why it wins:** owners will not hand over operations to something flaky; reliability is the price of the trust the whole model depends on.

### Bet 7 (P1) — Trust and compliance path.
To serve every business, including regulated ones, make trust a feature.
- **Add:** per-tenant data export and delete, PII handling policy, access logging, and a documented SOC 2 path (GDPR/HIPAA as clients require).
- **Why it wins:** the top horizontal players lead with this; it removes the last objection for serious buyers.

### Bet 8 (P0) — Kill the onboarding barrier (hybrid self-serve + managed).
The #1 barrier is skills and setup friction. Make first value fast: the OS interviews the owner in plain language, connects tools by MCP with a click, imports their data, and stands up a starting org the same day, with TMI finishing the backend.
- **Have:** `os2-intake`, Build-with-TMI, admin provisioning, industry-agnostic templates possible.
- **Add:** a conversational onboarding that provisions a full starting company (departments, workers, metrics, goals, first workflows) from a short interview, then hands the gaps to TMI. "First automation in the first hour."
- **Why it wins:** directly removes the barrier the research says kills SMB adoption.

### Bet 9 (P2) — The marketplace of roles and processes (network effects).
A library of prebuilt workers, workflows, and department templates that any business can install, contributed by TMI and, later, by the network. Every client that builds something good makes the platform better for the next.
- **Why it wins:** turns a horizontal platform's breadth into a compounding asset and a moat competitors cannot copy by shipping features.

### Bet 10 (P1) — Own the metric: the Company Intelligence Score as the category standard.
Push the Score and Owner Dependency to be the number every business is measured by, with benchmarks against anonymized peers ("you run more autonomously than 78% of businesses your size"), and certification as the public proof.
- **Have:** the Score, Owner Dependency, certification, the Proof Engine and flywheel.
- **Add:** cross-platform benchmarks and a public index.
- **Why it wins:** no competitor sells a standard for "how much of your business runs itself." Owning the yardstick is the deepest moat.

---

## 5. The moat

Features get copied. These do not, quickly:
1. **The managed model** — done-for-you removes the barrier the whole market trips on, and it is operationally hard to replicate.
2. **MCP-native breadth** — supports whatever a business runs on, for every business, without a per-tool build.
3. **The Score as a standard** — a metric the market adopts is a category, not a product.
4. **The flywheel** — fulfillment to proof to distribution to demand, already built, feeding itself.
5. **Compounding memory and marketplace** — every client and every build makes the next one better.

---

## 6. Recommended sequence

1. **MCP connector layer** (Bet 1) and **semantic memory** (Bet 2) and **conversational onboarding** (Bet 8) — the three P0 moves that make a horizontal, done-for-you OS real for any business.
2. **Orchestrator COO** (Bet 3), **guardrails** (Bet 5), **reliability queue** (Bet 6) — turn "acts" into "acts safely and never drops the ball."
3. **Observability/evals** (Bet 4), **trust/compliance** (Bet 7), **benchmarks/Score standard** (Bet 10).
4. **Marketplace** (Bet 9) as the network compounds.

The through-line: be the platform that *acts*, for *any* business, *safely*, with *no setup burden* on the owner, measured by *one number the market comes to trust*.

---

## 7. Sources

- Kore.ai, "7 best agentic AI platforms in 2026." https://www.kore.ai/blog/7-best-agentic-ai-platforms
- Slack, "Best Agentic AI Platforms for 2026." https://slack.com/blog/productivity/best-agentic-ai-platforms-for-2026-what-they-are-and-how-to-choose-one
- Lindy, "Gumloop vs Zapier vs Lindy (2026)." https://www.lindy.ai/blog/gumloop-vs-zapier
- Relay.app, "The 10 best AI agent builders in 2026." https://www.relay.app/blog/best-ai-agent-builders
- Windows Forum, "Agentic AI in 2026: From Copilots to Autonomous Enterprise Workflow Agents." https://windowsforum.com/threads/agentic-ai-in-2026-from-copilots-to-autonomous-enterprise-workflow-agents.427936/
- Royal Cyber, "Salesforce Agentforce vs Microsoft Copilot Studio." https://www.royalcyber.com/blogs/salesforce/salesforce-agentforce-vs-microsoft-copilot-studio-ai-agents/
- Arthur, "Agentic AI Observability: A 2026 Playbook." https://www.arthur.ai/column/agentic-ai-observability-playbook-2026
- MLflow, "Building Production-Ready AI Agents in 2026." https://mlflow.org/articles/building-production-ready-ai-agents-in-2026/
- Authority Partners, "AI Agent Guardrails: Production Guide for 2026." https://authoritypartners.com/insights/ai-agent-guardrails-production-guide-for-2026/
- OneReach.ai, "MCP & Multi-Agent AI." https://onereach.ai/blog/mcp-multi-agent-ai-collaborative-intelligence/
- MindStudio, "Six Agent Protocols Every AI Builder Needs to Know in 2026." https://www.mindstudio.ai/blog/six-agent-protocols-ai-builders-2026
- AWS/Techaisle, "SMB AI adoption." https://aws.amazon.com/smart-business/resources-for-smb/techaisle-ai-adoption/
- bigsur.ai, "AI Adoption in SMBs vs Enterprises: Rates, ROI, and Barriers." https://bigsur.ai/blog/ai-adoption-statistics-smb-vs-enterprise

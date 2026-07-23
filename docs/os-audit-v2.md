# TMI OS — Full Audit v2 (Developer · Owner · Client)

_Three independent reviews, one system. Read the codebase fresh after the live-data sync, richer onboarding, smart COO, first-win, and guardrails work._

---

## The one-line verdict

The bones are genuinely good — real agentic workers grounded in tenant data, a real guardrail model, a strong onboarding preview→approve→build→first-win sequence. But **almost everything of value is gated behind wiring the customer has not done and TMI has to hand-build.** All three lenses hit the same wall from different sides:

- **Client:** "A beautiful empty shell on day one — the command center is all dashes, the score reads 25%, and the workers don't actually act."
- **Owner:** "Every client go-live needs TMI to hand-wire integrations. That caps us at the dev team's capacity and makes per-outcome pricing impossible — you can't bill on 'invoices chased' until workers can chase them."
- **Developer:** "The connector/tools/workflow engines that would remove the hand-wiring are built, deployed, authenticated — and orphaned from the UI. Plus the new sync code has a real SSRF hole."

**The single highest-leverage move is the same for all three: wire the existing connector stack into the live-data view so a client can go live without TMI labor.** That one change fills the empty command center (client), lifts the scale ceiling (owner), and activates ~5 orphaned modules (developer).

---

## Lens 1 — Developer (correctness, security, wiring)

### Must-fix security
1. **SSRF in the new data-sync guard (HIGH).** `_ossync.js:16-31` (and the duplicate in `os2-intake.js:184-199`) only string-matches the literal hostname, then follows redirects. Bypassable via DNS rebinding (`evil.com` → `169.254.169.254`), 302 redirect to a metadata IP, or non-standard IP encodings (`http://2130706433`, octal, IPv4-mapped IPv6). Reachable by any owner via `setsource` + `syncnow` and the 6-hourly cron; fetched JSON becomes visible metric values, so internal endpoints partially exfiltrate. **Fix:** resolve host→IP and block on the resolved address, re-validate every redirect hop (or `redirect:'manual'`), reject exotic IP encodings. This is in code we shipped this session.
2. **SSRF in the generic `http` connector (HIGH, lower reachability).** `_osconnectors.js:161-200` does `fetch(p.url)` with zero host filtering and returns the body. Reachable via `os2-tool` when a worker has `tools:['http']` + auto-fire conditions. Inconsistent that sync/site are guarded but this is wide open.

### Correctness / reliability
3. **`os2-cron` overloads one 300s function.** Runs worker sweep + autoProof + pulseSweep + syncSweep sequentially; under load the Opus phases blow past `maxDuration:300` and `syncSweep` (last) silently never runs. Split phases into separate crons. (`syncSweep` is also already on its own `os2-sync` cron — redundant.)
4. **`daily_limit` accepted, stored, never enforced.** `_ospolicy.checkSpend` only reads `per_action_limit`. An owner who sets a daily cap gets zero enforcement — a governance control that does nothing.
5. **Workflow engine is inert.** `os2-flow` unreferenced by any HTML; no cron resumes `waiting` runs (they stall forever); `os2-crud.js:56` coerces steps to strings so structured step types can never be created. Dead on arrival.
6. **`_db.list` full-collection scans.** `_db.js:78-86` only pushes `order`/`limit` to Firestore with a single `where`; any 2-filter query fetches the whole tenant collection then filters in JS. Cost/latency grows unbounded with history (`os2-state` actions/signals/threads).
7. **Lower-severity:** shared `ingest_key` grants both metric-write and inbox-inject (`os2-ingest` + `os2-inbound`); unbounded metric auto-create; `os2-worker` `run` fakes a build-log entry without executing; `os2-threads assign` skips tenant-ownership check on referenced IDs; `os2-login` allows email enumeration (early-out defeats constant-time compare); `requireRole` fails open to owner on a role-less token; duplicated `isBlockedHost` and metric-extraction logic that will drift.

### Orphaned-but-deployed engines (attack surface with no product path)
`os2-integrations`, `os2-tool`, `_osconnectors`, `_ossecrets`, `_ostools` (connector vault + tool bridge), `os2-flow`/`_osflow` (workflows), `os2-audit`, `os2-memory`. Either wire them or gate them off at the router.

### What's solid (protect it)
Tenant scoping is consistent and correct across every mutating endpoint; cross-tenant contact collisions guarded; digest cron fails closed; secrets AES-256-GCM at rest, never echoed; the connector layer honestly returns `staged` instead of faking success.

---

## Lens 2 — Client (activation, value, trust)

1. **Day-one command center is all dashes.** Onboarding forces metric `value:'-'`, seeds no connections, so "your whole company on one screen" is an empty shell until the user does webhook/CSV plumbing or pays for a build. Largest gap between promise and first-run reality.
2. **The Intelligence Score headlines low right after the exciting build.** Workers seed OFF, no live data, no knowledge → ~25/100, "44 points to Certified." Deflating at peak-excitement moment.
3. **"Workers that act even when you're away" is gated behind 4 unexplained switches:** worker on + channel connected + autopilot on + guardrail = auto. Miss any one and the worker just parks a draft in the inbox marked "to send." The core value prop silently degrades to "an inbox of drafts."
4. **Trust controls are excellent but buried 9th in the nav.** The guardrail kill-switch + per-action modes + spend limit are genuinely reassuring — and a nervous owner has to scroll past everything to find them. The scary word "Autonomous" sits on worker cards with no nearby reassurance.
5. **Too many overlapping "build" surfaces.** Onboarding already built the company, yet nav offers Design-my-company (a *second* interview that reseeds), Build-with-TMI, Marketplace, and manual Departments — and `boot()` auto-lands empty accounts on the re-interview. Decision paralysis: "why is it asking me the same questions again?"
6. **22 nav items, ~a third dead-on-arrival** (Conversations, Sent, Brain, Live data, Reports, thin Pulse). Makes a real product feel like scaffolding.
7. **Brand-rule violations in live copy:** em dashes in the Team invite modal role options (`app.html:1279`); "No credit card to set it up" on `os/index.html` (throwaway reassurance).
8. **Signup→onboarding redundancy:** business_type picked at signup (incl. Agency/SaaS/Healthcare) is re-asked by the onboarding mode picker and doesn't visibly carry forward.

**Mobile:** solid — drawer + scrim + burger engage cleanly, no layout breakage. Only soft issue: 22-item nav means heavy scrolling in the mobile drawer.

---

## Lens 3 — Owner (money & scale)

1. **The pricing page is orphaned — you're hiding your own price list.** `/pricing` (the $25k / $5k-mo / Growth Partner ladder) is linked only from the four segment pages — not homepage, nav, or footer. `/partners` only from `for-agencies`. Highest ROI-per-hour fix on the site.
2. **Three funnel front doors, three promises.** Content engine (~60 articles + scorecard + `/complete-audit`) → 30-min Cal booking; offer pages → async 2-business-day application; the audit is "45 min" in one place, a 30-min slot in another. Intent leaks at the seam.
3. **Per-outcome pricing (the stated thesis) has zero substrate.** It appears in no offer, and the "value delivered" meter counts *messages sent*, not dollars/jobs — resting on workers that only draft. You can't sell "per invoice chased" until workers chase invoices and a meter aggregates the dollars.
4. **The installer/agency channel is a multi-tenancy demo, not a paid channel.** Workspace creation + switching works. Missing: billing, revenue share, white-label, certification, per-client spend visibility, and vetting (installer powers gate on an un-enforced `plan==='partner'` string). Agencies can log in as clients but can't get paid or put their brand on it.
5. **No subscription billing or plan enforcement anywhere.** `plan` gates nothing; the only checkout is a stray $1,000 audit. The one compounding line ($5k/mo AI Department) has no system collecting it. Survivable at 10 clients, fatal at 100.
6. **Manual-wiring bottleneck is THE scale ceiling.** Every client go-live needs TMI to hand-wire integrations. COGS and calendar are both linear in client count. This is the 10→100 constraint — and the fix is mostly connecting `os2-integrations` (already built) to the live-data view.
7. **Uncapped Claude spend per tenant.** Workers + Pulse run on Opus with large context and no enforced per-tenant ceiling (the guardrail caps don't bind on the live path). Uncapped COGS sitting against a $5k/mo price.
8. **Conflicting audit offers still live:** free 45-min audit vs. a stray $1,000 Stripe checkout (`audit-capture.js`), and the article engine's `/complete-audit` CTA bypasses the branded funnel.
9. **No proof at the point of decision.** The $25k / $5k-mo pages carry zero outcomes, numbers, or logos, though `outcomes.html`/`/portfolio` exist. High-ticket application offers convert on proof.
10. **In-OS plan ladder contradicts the public one** — `renderPlans` still leads with "Self-serve OS · build it yourself," the door the owner deliberately closed publicly.

---

## Prioritized action plan

### P0 — Security (do now, small)
- Harden the SSRF guard: resolve→IP block, validate every redirect hop, reject exotic IP encodings; apply to both `_ossync.js` and `os2-intake.js` (dedupe into one shared guard). Add the same guard to `_osconnectors.executeHttp`.
- Gate the orphaned engines (`os2-integrations/tool/flow/audit/memory`) off at the router until wired, or wire them (see P1).

### P1 — The one unlock everything shares: kill the empty-shell day one
- **Wire `os2-integrations` + the connector stack into the live-data view** so a client connects a real source (Stripe/QuickBooks/Sheet) without TMI labor. Fills the command center, lifts the scale ceiling, activates dead code.
- **Seed a visible first value:** turn on one safe read-only worker `active` by default, and/or seed 2-3 clearly-labeled "sample" metrics, so the command center and the Intelligence Score show life in minute one.
- **Make autonomy legible + move the kill-switch up:** one "what your workers can do right now" panel showing the on→channel→autopilot→guardrail chain in plain language.
- **Collapse the build surfaces / shrink the nav;** stop auto-landing users on a re-interview of what onboarding already answered.

### P2 — Make the money reachable and billable
- Put `/pricing` and `/partners` in primary nav + footer; route the content engine and homepage to one funnel; retire the stray $1,000 audit and repoint `/complete-audit`.
- Add proof (two real outcome numbers + one before/after) to the audit and pricing pages; add a budget/authority qualifier to the free-audit application.
- Ship real per-tenant metering + enforced spend caps (route the live send path through `_ospolicy.evaluate`), then build the outcome meter on business actions, not messages — the substrate per-outcome pricing needs.
- Turn the installer channel into a paid channel: Stripe subscriptions + plan enforcement, a revenue-share ledger, basic white-label.

### P3 — Polish
- Fix brand-rule violations (em dashes in invite modal, "no credit card" line).
- Carry signup `business_type` into onboarding.
- Split the cron phases; enforce or remove `daily_limit`; fix `_db.list` to push order/limit; fix the `os2-worker run` fake-work branch and `os2-threads assign` ownership check.

_Through-line: the product is emptier on day one than it actually is, because the value is real but gated behind un-done wiring. Close that gap and the same move pays off in all three lenses._

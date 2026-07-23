# TMI OS — Complete Audit (developer · owner · client)

A full read of the live OS (os.tmitechai.com): every view's render code and its backing endpoints, scored three ways — **developer** (real vs. stubbed, bugs, security, wiring), **owner** (value, retention, monetization, vision fit), **client** (daily usability and what's missing).

---

## The one finding that explains most of the others

**The OS has powerful engines built, and the good ones are unwired.** Across four independent passes the same pattern showed up: the hard, differentiated capability exists as real backend code but nothing in the app calls it, so the product ships the *thin* path.

| Built and real | Wired to the product? | What ships instead |
|---|---|---|
| Policy/guardrails engine (`_ospolicy`) | **No** — only the dead `os2-tool` path calls it | worker.autonomy + autopilot flag; client's rules/caps ignored |
| Workflow engine (`_osflow`: steps, waits, approvals, branches) | **No** — UI stores inert strings | "Workflows" is a notepad |
| Tool/connector action stack (`_ostools` + `_osconnectors`) | **No** — `workerFields` can't grant tools | workers only draft text (+ optional email/SMS) |
| Integrations UI (`os2-integrations`: live Stripe/Slack/HTTP, encrypted vault, test) | **No** — orphaned | connect = manual webhook + a ticket a human fulfills |

So the fastest path to a dramatically better OS is mostly **wiring, not writing** — connecting engines that already exist to the surfaces clients touch.

---

## Fixed in this pass (already deployed)

- **Digest cron failed open** — ran unauthenticated when `CRON_SECRET` was unset; now requires a real Vercel cron or a matching secret.
- **Kill switch ignored on auto-fire** — `canAutoFire` now honors `tenant.paused`, so "Pause everything" actually stops autonomous sends.
- **SSRF in the onboarding builder** — `fetchSite` now blocks localhost, private, link-local, and cloud-metadata hosts before fetching a user-supplied URL.
- **False "Live" metric badge** — manually entered metrics were labeled "Live"; they now read "Manual," and only metrics with a real update signal show "Live · updated…".

---

## Critical findings, ranked

### P0 — Safety and trust (a client could be harmed or misled)

1. **Guardrails are stored but not enforced.** The per-action modes ("Email a customer: Never / Ask first / On its own") and spend caps a client sets are read only by `_ospolicy.evaluate`, which is reachable only through `os2-tool` — a path **no UI or cron calls**. The live send path (`_osact.canAutoFire`/`runAction`, `os2-cron`, `os2-act` approve) uses a simpler rule and never loads `os_policies`. The **kill-switch portion is now fixed**; the per-action rules and spend limits are still not honored. This is the highest-priority remaining fix: route the live send path through `_ospolicy.evaluate`. Until then, the Guardrails screen builds trust the backend doesn't keep.
2. **Digest cron fail-open** — fixed.
3. **SSRF in onboarding `fetchSite`** — fixed (host guard). Residual: a public URL that 302-redirects to an internal host is still followed; a full fix re-checks every redirect hop.

### P1 — The core promise ("the OS runs the business" / outcome-billable)

4. **Workers only draft; they don't act.** The connector actions (chase an invoice in QuickBooks, book a job, create a Stripe link) are never invoked by a worker run — `_osrun.produce` never loads the tool stack, and `workerFields` can't grant a worker any tools. The only real action is a single email/SMS, and only if the tenant configured a channel + autopilot. **This is the precondition for outcome-based pricing** — you can't bill on "invoices chased" until workers can chase them. Fix: wire `_ostools.executeTool` into `executeWorker`, add a tool-grant control to `workerFields`.
5. **Thread replies never deliver.** `os2-threads` reply omits the `from` lookup, so every reply silently stages instead of sending, even with a channel connected. One fix away from real — route replies through `runAction`/`tenantChannel`, and validate the `to` against the stored contact (an injected inbound could otherwise turn a connected channel into a sender to an arbitrary address).
6. **The workflow engine is dark.** `_osflow` is the strongest backend module (typed steps, waits, human approvals, branching) but the UI stores plain strings and never runs anything; timed `wait` steps never resume (no cron sweep). Fix: a Run button + run history wired to `os2-flow`, typed-step authoring, and a cron resume sweep.
7. **Self-serve integrations are manual.** Connecting a tool files a build ticket a human fulfills; the real connector UI (`os2-integrations`, with live Stripe/Slack/HTTP) is orphaned. Wire it into the Live-data view so at least the live connectors are true self-serve. Without this, "the OS runs on actuals" depends on TMI labor per account — a services motion wearing a SaaS coat.
8. **Live data is the gating dependency.** Metrics are manual until a connector is wired, so most tiles, the COO briefing, Pulse, and reports run on typed-in numbers. Live sync (pull revenue/cash/leads on a schedule + history) is what makes every screen true.

### P1 — Bugs

9. **Blueprint "apply" is non-idempotent** — running "Design my company" twice duplicates every department/worker/metric/goal and re-files "Connect X" requests. Reseed-or-merge + a confirm dialog.
10. **Marketplace install is non-idempotent** — re-installing a pack duplicates rows; no "installed" state; installed items land inactive so nothing runs until separately turned on (the "TMI wires the backend" toast overpromises).
11. **Kill switch still lets the cron produce drafts** — auto-fire is now blocked when paused, but `os2-cron` still runs paused tenants' workers (drafts hold safely in the inbox). Cleaner: skip paused tenants in the sweep.
12. **"Realtime" cadence runs daily** — `isDue` treats realtime and daily the same (~20h). Either honor realtime or remove the option.

### P2 — Depth and intelligence

13. **The COO is stateless and half-blind.** `os2-ask` posts only the current question (no memory despite "Ask a follow-up") and its context excludes goals, connections, threads, and delivered work. Pass recent turns + goals + connection status.
14. **Reports and workers can't see what actually happened** — context excludes `os_actions`, outputs, and threads, so a "weekly report" can't say "your workers sent 34 messages, booked 6 jobs" — the exact outcome narrative that sells.
15. **Knowledge isn't retrieved, it's dumped.** Worker grounding concatenates all knowledge, each body clipped to 600 chars — more knowledge makes workers worse and truncates SOPs. Route worker grounding through `_osbrain.search` and chunk long bodies.
16. **The Brain is keyword-only and snippet-grounded** — matches token overlap (misses "AR" vs "receivables") and answers from 200-char fragments. Ground on full chunked bodies; add embeddings.
17. **An AI outage looks like "all clear."** With no API key, Pulse returns `[]` → "All clear"; the COO throws indistinguishably. Distinguish outage from healthy-quiet.
18. **No outcome metering.** `os_actions` logs every send but nothing aggregates it into a "value delivered this month" number — the surface that makes outcome-billing real and self-evident. (Ties directly to the pricing decision.)
19. **Build-with-TMI is silent server-side** — a request notifies no one at TMI; the upsell to the done-with-you offer depends on someone watching the admin console. Notify on create + show an expected-response window.

### P3 — Polish and trust surfaces

- **Overview/Tasks are passive** — Overview's only CTAs are "design more"; give an empty tenant one concrete next action. Tasks hide provenance (a Pulse- or COO-generated task looks like a manual note) and never use the `due` field.
- **Owner-dependency is shown three ways** (Overview "Still runs on you," Command "Still depends on you" / "Runs without you") — pick one label for the headline metric.
- **Activity** is capped at 30, no filter, no deep-links — a glance, not the auditable record PE/agency buyers want.
- **Team** invites have no expiry/resend/revoke; role changes aren't logged.
- **Autopilot** (real, enforced) lives in Settings while the kill switch lives in Guardrails — split governance across two screens telling two stories. Consolidate.
- **Disconnect** leaves an encrypted credential tombstone (`_ossecrets` has no `removeSecret`); add true deletion.
- **Overpromising copy** — "TMI wires these into every action" / "TMI wires the backend" assert automation that is manual or unenforced. Tighten until the wiring is real.

---

## What's genuinely strong (don't rebuild)

- **Inbox / approve-and-send** — the most real view: a draft becomes a delivered, logged email/SMS on one tap, with honest status. This is the "it runs the business" proof point.
- **Pulse** — the company watching itself: full context to Opus, strictly validated actions, one-tap act/dismiss. The differentiator vs. a dashboard. (Needs its daily cron wired and surfaced.)
- **Company Brain** — grounded Q&A with real citations and an honest "don't know." The clearest "we know your business" moment.
- **Blueprint** — a 30-second company from five questions; the wedge (fix the duplicate-on-reapply bug).
- **Command center** — dense enough to justify a daily login (now with an honest Live/Manual distinction).

---

## Recommended order

1. **Enforce guardrails on the live path** (P0-1) — safety, and it's mostly wiring the existing `_ospolicy` engine into `runAction`/`canAutoFire`/cron.
2. **Wire the tool stack into workers** (P1-4) + **fix thread reply delivery** (P1-5) — the two changes that turn "drafts" into real, billable work.
3. **Wire live-data sync + the integrations UI** (P1-7/8) — makes every screen run on actuals and removes the per-account labor.
4. **Surface the workflow engine** (P1-6) and **fix the idempotency bugs** (P1-9/10).
5. **Add outcome metering** (P2-18) — the "value delivered this month" number that makes outcome-based pricing real.

Then COO memory/context, knowledge retrieval, reports depth, and the polish list.

The theme holds all the way down: **the OS is closer to its promise than it looks — most of the gap is connecting engines that already exist to the surfaces clients touch, and making the trust controls actually bind.**

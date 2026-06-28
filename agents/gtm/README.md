# TMI GTM — Agentic SDR System

An autonomous SDR that finds ICP-fit companies, diagnoses each one's true operational
bottleneck, builds a personalized Intelligent Company Audit (microsite + executive card
image), and hands the lead to Instantly with the audit as merge fields. Instantly sends
the first email and the sequence. Replies are handled by a human.

## The pipeline (per daily run)

```
Prospect  → Research → Audit → Personalize → Send/Sequence → (Book → Prep)
 Apollo      Sonnet     Sonnet    Firestore     Instantly        QStash
```

1. **Prospect** (`tools/apollo.js` → `orchestrator.findLeadsApollo`)
   ICP-precise Apollo people-search: target titles × employee ranges (20-500) ×
   industry keywords × US. Reveals work email, dedupes by email, inserts the lead.
   Falls back to Apify Maps (`findLeadsMaps`) if Apollo returns nothing.

2. **Research** (`tools/research.js`)
   Fetches the site + careers pages, fingerprints the **tech stack** (~35 tools) and
   **bottleneck hiring signals** (Dispatcher, Ops Coordinator, Data Entry…), then Sonnet
   diagnoses the **one true bottleneck** (founder / information / latency) with evidence.

3. **Audit** (`audit-build.js`)
   Sonnet turns the research into structured audit data: Intelligence Score, category
   scores, bottlenecks, current → future state, potential savings/hours. Grounded in the
   detected tools and signals.

4. **Personalize** (`audit-site.js`, `audit-card.js`, stored in Firestore `prospect_audits`)
   The microsite renders dynamically at `/audit/<slug>` and the executive card image at
   `/api/audit-card?slug=<slug>` — live the instant the lead is created (no deploy lag).

5. **Send / Sequence** (`tools/instantly.js`)
   Pushes the lead to an Instantly campaign with custom variables: `audit_link`,
   `audit_card`, `intel_score`, `primary_bottleneck`, `industry`, `location`. Instantly
   owns sending, inbox rotation, warmup, and the full follow-up sequence.
   (If Instantly env is absent, falls back to Resend send + the in-house 5-step sequence.)

6. **Book → Prep** (`api/booking-confirmed.js` → `api/audit-prep.js`)
   When a call books, QStash queues `audit-prep` (`audit-prep.js`) which writes a
   pre-call intelligence brief and emails the team.

## Running it

- **Scheduled:** `.github/workflows/gtm-daily.yml` runs `node gtm/orchestrator.js` daily
  (targets `LIMITS.leadsPerDay`, default 100), then commits any static artifacts.
- **On Coolify:** the same `node gtm/orchestrator.js` can run as a scheduled container
  job; the site + `/api/*` run via the root `server.js` + `Dockerfile`.
- **Ad hoc:** `POST /api/gtm-run` (bearer `GTM_RUN_SECRET`) or the admin "Run outbound now".

## Observability

- Every run logs a `gtm_runs` record (found / contacted / errors / source / elapsed).
- Per-lead stage lives in the lead `status`: `new → in_campaign` (Instantly) or `→ sent`,
  plus `intel_score`, `audit_url`, `audit_card`.
- Admin command center: **admin.tmitechai.com/outbound**.

## Config (`config.js`)

- `ICP.targetTitles`, `ICP.employeeRanges`, `ICP.industryKeywords`, `ICP.locations`
- `LIMITS.leadsPerDay` (100), `LIMITS.maxCombosPerRun`
- `SOURCE` = `apollo` (default when `APOLLO_API_KEY` set) or `maps`

## Environment

| Var | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | research + audit agents |
| `APOLLO_API_KEY` | prospecting + email reveal |
| `APIFY_API_TOKEN` | maps fallback sourcing |
| `FIREBASE_SERVICE_ACCOUNT` | leads + audits + run log |
| `INSTANTLY_API_KEY`, `INSTANTLY_CAMPAIGN_ID` | sending + sequence |
| `RESEND_OUTREACH_API_KEY`, `OUTREACH_INBOXES` | Resend fallback + digests |
| `QSTASH_TOKEN` | booking → audit-prep |
| `GTM_RUN_SECRET` | ad-hoc trigger |

## Agents at a glance

| File | Role |
|---|---|
| `orchestrator.js` | run loop: source → per-lead pipeline → follow-ups → digest → run log |
| `outbound.js` | per-lead: research → audit → store → push to Instantly (or Resend) |
| `tools/apollo.js` | ICP prospecting + contact/email enrichment |
| `tools/research.js` | tech-stack + signals + true-bottleneck diagnosis |
| `audit-build.js` | structured audit data (score, bottlenecks, future state) |
| `audit-site.js` / `audit-card.js` | dynamic microsite + executive card image |
| `tools/instantly.js` | push lead + audit variables into a campaign |
| `audit-prep.js` | pre-call brief on booking |
| `reply-handler.js` | (available, not wired — replies handled by a human) |

---

## Prospect-gen agents (top-of-funnel expansion)

Run by `prospect-gen.js` (CLI: `node gtm/prospect-gen.js`, HTTP: `POST /api/prospect-gen`,
scheduled by `.github/workflows/gtm-prospect-gen.yml` at 9am ET). Each agent feeds the
same SDR pipeline (creates `new` leads the orchestrator audits + contacts) and degrades
to a no-op without its keys.

| Agent | File | What it adds | Keys |
|---|---|---|---|
| Intent + trigger events | `intent-agent.js` + `tools/filings.js` | job/social/reddit signals PLUS new permits, expansion news, new carrier authority | `APIFY_API_TOKEN`, `BRAVE_API_KEY`, `SOCRATA_APP_TOKEN` (opt), `FMCSA_NEW_AUTHORITY_URL` (opt); set `PERMIT_SOURCES` in `intent-config.js` per metro |
| CRM reactivation | `reactivate.js` | re-works dormant leads you already own (abandoned audits, no-reply) | none (Firestore only) |
| Lookalike expansion | `lookalike.js` | clones your wins (booked/won/client) into near-identical companies via Apollo | `APOLLO_API_KEY` |
| SMS / phone channel | `sms-outreach.js` | texts owners whose audit is ready; queues hottest as call tasks | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `OUTREACH_SMS_FROM` |
| Email enrichment waterfall | `tools/enrich.js` | Apollo → Findymail → Dropcontact → verify, for higher deliverable-email rate | `FINDYMAIL_API_KEY` (opt), `DROPCONTACT_API_KEY` (opt) |
| Website visitor de-anon | `api/visitor-reveal.js` | turns identified site visitors into warm `new` leads | `VISITOR_REVEAL_SECRET` + a reveal vendor (RB2B/Vector/Clearbit) posting to `/api/visitor-reveal?secret=…` |

Tuning knobs (env): `GTM_REACTIVATE_LIMIT` (25), `GTM_LOOKALIKE_LIMIT` (60), `GTM_SMS_LIMIT` (40).

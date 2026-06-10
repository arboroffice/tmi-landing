# Supabase → Firestore Migration Plan

Goal: remove **all** Supabase usage across the entire codebase (API, agents, frontend, SQL) and run everything on **Cloud Firestore** (project `tmitech-e264c`), with no data loss and no extended downtime for the live ops platform.

> Status: PLAN — nothing migrated yet. Approve the approach + open decisions at the bottom before execution.

---

## 1. Surface inventory (what touches Supabase today)

| Surface | Where | Notes |
|---|---|---|
| **API endpoints** | `api/*.js` — 63 files, **233** `.from()` call sites | Server-side (Vercel functions). Uses `@supabase/supabase-js` service key. |
| **Shared API helpers** | `api/_supabase.js`, `api/_oscrud.js`, `api/_comms.js`, `api/_visitor-settings.js`, `api/_visitor-score.js` | `_supabase` = client factory; `_oscrud` = generic CRUD factory used by `os-*`. |
| **GTM agents** | `agents/gtm/tools/db.js`, `agents/gtm/{inbound,job-monitor,reply-handler,content-repurpose}.js`, `agents/email-sender.js` | Separate Node automation; its own DB helper. |
| **Frontend (exceptions)** | `admin-settings.html`, `project/field.html` | The only pages that hit Supabase directly; everything else calls `/api/*`. |
| **Schema / SQL** | `supabase-schema.sql`, `supabase-setup.sql`, `supabase-newsletter.sql`, `supabase-city-leads.sql` | Source of truth for the 28 collections. |
| **Env vars** | `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` | Replace with `FIREBASE_SERVICE_ACCOUNT`. |

### Collections (28), grouped
- **CRM (relational core):** `contacts` (root), `leads`, `clients`, `activities`, `applications`, `followups`, `proposals`, `projects`, `invoices`, `sms_log`
- **Comms/newsletter:** `email_campaigns`, `email_templates`, `email_sends`, `newsletter_issues`, `city_leads`, `audit_submissions`
- **Content:** `content_items`, `content_ideas`, `content_posts`
- **Visitors:** `site_visitors`
- **Ops OS:** `os_goals`, `os_subtasks`, `os_meetings`, `os_kv`, `os_scorecard_metrics`, `os_scorecard_entries`, `os_recruiters`, `os_candidates`
- (plus the `fotf_*` tables in schema — confirm which are live vs. legacy)

---

## 2. Architecture decisions

1. **Server uses Firebase Admin SDK + service account** (NOT the web/client config). Service account JSON is loaded from a Vercel env var `FIREBASE_SERVICE_ACCOUNT` (base64 of the JSON). The file in `~/Downloads/...adminsdk...json` is a **secret** — never committed; `.gitignore` it defensively.
2. **Doc ID = the existing Postgres `uuid`.** Migrate every row to a Firestore doc whose ID is its current `id`. This preserves every foreign key (`contact_id`, `lead_id`, ...) as a string reference to a doc ID — relationships keep working without remapping.
3. **No joins → explicit hydration.** PostgREST embedded selects (`select('*, contacts(*)')`, nested `invoices→clients→contacts`, `os_goals→os_subtasks`) become parent-fetch + child-fetch helpers (`hydrate()` functions). ~10 patterns, ~20 sites.
4. **Uniqueness (e.g. `contacts.email`) via query-then-write / transaction** (Firestore has no unique constraints). Already the pattern in `subscribe.js`.
5. **One thin data-access layer** `api/_db.js`: init Admin app once; expose small primitives (`getDoc`, `queryWhere`, `insert`, `update`, `remove`, `upsertByField`, `list`). Reimplement `_oscrud.crud()` on top of it once → many `os-*` endpoints migrate together.
6. **Backend flag for safe rollback:** `DB_BACKEND=supabase|firestore`. Endpoints route through the layer; we flip per-endpoint or globally, and can revert instantly while validating.
7. **Arrays/JSON are easier in Firestore** (`tags` array, `line_items` JSON) — native maps/arrays; this also retires the `tags`-column pain entirely.

---

## 3. Hard parts (call out explicitly)

- **Relational reads** (~20 sites): rewrite as hydration. Watch the nested invoice→client→contact.
- **`null` / `not is null` filters** (`newsletter.js`, `email-send.js` use `.not('email','is',null)`, `.neq(...)`): Firestore can't filter "field != null" efficiently — store a boolean (e.g. `has_email`) or filter in app code.
- **Large scans / cost:** newsletter send reads up to 50k contacts; `site_visitors` lists; admin tables. Firestore bills per doc read — budget for it, add pagination where lists are unbounded.
- **Composite indexes:** any multi-field `where + orderBy` needs a Firestore composite index (declare in `firestore.indexes.json`). Enumerate during endpoint migration; Firestore errors give the exact index to create.
- **`upsert(onConflict)`** (6 sites): becomes get-or-create / set-with-merge keyed by the conflict field.
- **Agents subsystem + 2 frontend pages:** separate code paths; migrate alongside.

---

## 4. Phases

**Phase 0 — Setup (no behavior change)**
- Add `firebase-admin` to `package.json`. Create `api/_db.js` (Admin init from `FIREBASE_SERVICE_ACCOUNT`). Enable Firestore in the project; lock security rules to deny all client access (server-only via Admin SDK). Add `.gitignore` for any service-account JSON. Set the env var in Vercel.

**Phase 1 — Data migration script (one-time, idempotent)**
- `scripts/migrate-supabase-to-firestore.js`: read every table via `@supabase/supabase-js`, write each row to `collection(table).doc(id)` with field transforms (timestamps, arrays/json). Run, then **verify row counts per collection** Supabase vs Firestore. Re-runnable (set/merge).

**Phase 2 — Data-access layer + CRUD factory**
- Implement `api/_db.js` primitives + hydration helpers. Reimplement `_oscrud.crud()` on Firestore. Unit-smoke each primitive.

**Phase 3 — Migrate endpoints by domain (dependency order)**
1. Signup/contacts path: `subscribe`, `contact-submit`, `contacts`, `unsubscribe`, `nl-unsubscribe`
2. CRM: `leads`, `clients`, `activities`, `followups(.js)`, `applications`, `proposals`, `projects`, `invoices`, `account`
3. Content: `content`, `content-ideas`, `content-posts`, `content-hub`
4. Ops OS (via `_oscrud`): `os-goals`, `os-meetings`, `os-kv`, `os-scorecard`, `os-recruiting`, `os-meeting-*`
5. Comms/newsletter: `email-send`, `emails`, `email-templates`, `newsletter`, `newsletter-archive`, `brief`, `sms`, `_comms`
6. Visitors: `visitors`, `visitor-*`, `rb2b-webhook`, `apify-ingest`, `_visitor-*`
7. Audits/misc: `audit-*`, `city-lead-apply`, `city-leads`, `partner-submit`, `proposal-accept`, `settings`, `health`
8. **Agents subsystem:** `agents/gtm/tools/db.js` + agent files
9. **Frontend exceptions:** `admin-settings.html`, `project/field.html`

Each endpoint: rewrite queries → test the live flow + the admin tab that reads it.

**Phase 4 — Verification**
- Walk every admin tab and every public form end-to-end against Firestore. Compare against Supabase where possible. Fix index/shape issues.

**Phase 5 — Cutover & teardown**
- Flip `DB_BACKEND=firestore` everywhere. Remove `@supabase/supabase-js`, `api/_supabase.js`, `supabase-*.sql`, `SUPABASE_*` env vars, and the backend flag. Full regression.

**Phase 6 — Cleanup**
- Remove the migration script (or archive), finalize `firestore.rules` + `firestore.indexes.json`, document the new model.

---

## 5. Risks & rollback
- **Live ops platform** — incremental per-endpoint with the `DB_BACKEND` flag and Supabase kept warm until Phase 5 verified. No big-bang.
- **Cost** — per-read pricing on list-heavy admin + 50k newsletter scans; add pagination/limits.
- **Index gaps** — surface as runtime errors with a create-index link; handle during Phase 3.
- **Data drift** — if Supabase keeps taking writes during migration, do a final delta re-sync right before cutover (or freeze writes briefly).

## 6. Effort
Substantial — realistically a **multi-day, staged effort** (28 collections, 233 query sites, 63 files + agents + 2 frontends + data migration + full regression). The abstraction layer + `_oscrud` reuse cut the per-file cost; the relational rewrites and verification are the long poles.

---

## 7. Open decisions (need your call)
1. **Approach:** (A) thin Supabase-compatible shim over Firestore to minimize edits, or (B) rewrite each call to idiomatic Firestore (cleaner, more work). Recommend **B with the `_db.js` helper** — shimming PostgREST's embedded-join syntax is more trouble than it's worth.
2. **Incremental vs big-bang:** Recommend **incremental** behind `DB_BACKEND`. Confirm.
3. **`fotf_*` tables:** which are live vs legacy? (Don't want to migrate dead tables.)
4. **Data freeze window:** can we briefly pause writes at cutover, or do you need zero-freeze (requires delta re-sync)?
5. **Analytics:** keep the Firebase **client** config (`getAnalytics`) you pasted for site analytics? (Separate from the data migration; harmless to add.)

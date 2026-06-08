# RB2B Visitor Identification → Admin + Meta Retargeting

Person-level identification of US site visitors (RB2B), landed in the admin
portal, with an optional sync into a Meta Custom Audience for retargeting.

## Pieces

| File | Role |
|------|------|
| `rb2b.js` | RB2B pixel loader (key `E63P0HZ15KOW`), injected on every public page that carries the Meta Pixel. |
| `api/rb2b-webhook.js` | Receives RB2B's identified-visitor POSTs and upserts `site_visitors`. Storage only — does **not** auto-create contacts/leads or contact anyone. |
| `api/visitors.js` | Admin GET list / DELETE for visitors. |
| `api/visitor-enroll.js` | Admin "approve & enroll" — creates a contact + lead, starts the email-only nurture, adds to the Meta audience. |
| `api/visitors-sync-meta.js` | Bulk-pushes visitor emails into a Meta Custom Audience (button on the Visitors page). |
| `api/_meta-audience.js` | Shared Meta Custom Audience helper (create/find + push hashed emails). |
| `admin-visitors.html` | Admin "Site Visitors" page (Sales group). Per-row **Enroll** button + status badges. |
| `supabase-visitors.sql` | `site_visitors` table + indexes (incl. `enrolled` / `lead_id`). |

## Follow-up model (review → approve)

Identified visitors are **stored only** by the webhook — nobody is contacted automatically.
In the admin Site Visitors page you click **Enroll** on a visitor, which:

1. Creates/links a contact and a lead (`source = 'rb2b-visitor'`).
2. Schedules an **email-only** nurture (`visitor_day0` / `day3` / `day7`) via QStash → `/api/followup`.
   Every email carries an unsubscribe link (CAN-SPAM); unsubscribing sets the lead to
   `unsubscribed` and stops the sequence.
3. Adds the visitor's email (hashed) to the Meta Custom Audience for Facebook/IG retargeting.

**No SMS is ever sent to identified visitors** — they never gave express consent (TCPA).
SMS stays reserved for real opted-in leads/bookings in the existing `followup.js` steps.

Requires (already used by the lead nurture): `RESEND_API_KEY`, `QSTASH_TOKEN`,
`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.

## One-time setup

1. **Create the table.** Run `supabase-visitors.sql` in the Supabase SQL editor
   (or via the Supabase MCP `apply_migration`). It is idempotent.

2. **Point RB2B at the webhook.** In the RB2B dashboard → Integrations →
   Webhook, set the destination to:
   ```
   https://www.tmi-technology.com/api/rb2b-webhook?secret=<RB2B_WEBHOOK_SECRET>
   ```
   (or send the secret as an `x-rb2b-secret` header).

3. **Set environment variables in Vercel:**
   | Var | Purpose |
   |-----|---------|
   | `RB2B_WEBHOOK_SECRET` | Shared secret the webhook checks. If unset, the endpoint accepts all payloads (logs a warning) — set it before going live. |
   | `META_CAPI_ACCESS_TOKEN` | Already used by the CAPI helper; reused to write the audience. |
   | `META_CUSTOM_AUDIENCE_ID` | Target Custom Audience. If unset, one named "RB2B Site Visitors" is auto-created (needs `META_AD_ACCOUNT_ID`). |
   | `META_AD_ACCOUNT_ID` | Numeric or `act_`-prefixed; needed to auto-create the audience and to build lookalikes. |
   | `ANTHROPIC_API_KEY` | AI-drafted first-touch emails (`/api/visitor-draft`). Already set. |
   | `APOLLO_API_KEY` | Apollo enrichment + buying committee (`/api/visitor-enrich`). Optional; feature degrades if unset. |
   | `CRON_SECRET` | Optional: lets you trigger the weekly digest manually via `?secret=`. |
   | `TWILIO_*` | Reused for hot-visitor internal alerts (SMS to the operator only). |

4. **Deploy.** The pixel only goes live when this branch merges to `main`
   (every push to `main` triggers a Vercel deploy).

## Flow

```
visitor lands → rb2b.js resolves identity → RB2B POSTs profile
   → /api/rb2b-webhook → site_visitors (+ contacts/activities)
   → admin "Site Visitors" page (review)
   → "Sync to Meta Audience" button → /api/visitors-sync-meta
   → Meta Custom Audience (retarget on FB/IG)
```

## Intelligence layer (admin Site Visitors page)

| Capability | Where |
|---|---|
| **Lead-fit scoring** (0-100, ICP industry / seniority / intent page / visits) | `_visitor-score.js`, computed on ingest + shown/sortable in admin |
| **Hot-visitor alerts** (SMS + email to the operator when score ≥ 70) | `rb2b-webhook.js` |
| **Dedup / suppression** (flags Known / Client / Unsubscribed / own-domain; blocks cold-enroll of those) | `visitors.js` + `visitor-enroll.js` |
| **Account rollup** (group visitors by company) | admin "Accounts" tab |
| **Apollo enrichment + buying committee** | `/api/visitor-enrich` (button) |
| **AI-drafted first touch** | `/api/visitor-draft` (button) → used as the day-0 email body |
| **LinkedIn outreach queue** (drafted message, mark-sent) | admin "LinkedIn" tab + `visitors.js` PUT |
| **Conversion attribution** (visitor → booked/won marks the visitor converted) | `leads.js` |
| **Meta lookalike audience** (no ad spend) | `/api/visitors-lookalike` (button) |
| **Weekly visitor digest email** | `/api/visitor-digest` (Vercel cron, Mondays 13:00 UTC) |

Auto-creating spending ad **campaigns** is intentionally NOT wired up (only the
audience + lookalike) to avoid surprise spend — say the word to add a paused
campaign scaffold.

## Compliance note

Person-level visitor identification has GDPR/CCPA implications. Before going
live: update the privacy policy to disclose visitor identification and
ad-audience use, and confirm RB2B's coverage is limited to jurisdictions you're
comfortable with (RB2B resolves US visitors only). Meta Custom Audience uploads
must be SHA-256 hashed (handled in `visitors-sync-meta.js`) and require that you
have a lawful basis / consent for the contacts uploaded.

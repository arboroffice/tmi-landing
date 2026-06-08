# RB2B Visitor Identification → Admin + Meta Retargeting

Person-level identification of US site visitors (RB2B), landed in the admin
portal, with an optional sync into a Meta Custom Audience for retargeting.

## Pieces

| File | Role |
|------|------|
| `rb2b.js` | RB2B pixel loader (key `E63P0HZ15KOW`), injected on every public page that carries the Meta Pixel. |
| `api/rb2b-webhook.js` | Receives RB2B's identified-visitor POSTs, upserts `site_visitors`, links/creates a contact. |
| `api/visitors.js` | Admin GET list / DELETE for visitors. |
| `api/visitors-sync-meta.js` | Hashes visitor emails and pushes them into a Meta Custom Audience (manual, button-triggered). |
| `admin-visitors.html` | Admin "Site Visitors" page (Sales group in the sidebar). |
| `supabase-visitors.sql` | `site_visitors` table + indexes. |

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
   | `META_AD_ACCOUNT_ID` | Numeric or `act_`-prefixed; only needed to auto-create the audience. |

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

## Compliance note

Person-level visitor identification has GDPR/CCPA implications. Before going
live: update the privacy policy to disclose visitor identification and
ad-audience use, and confirm RB2B's coverage is limited to jurisdictions you're
comfortable with (RB2B resolves US visitors only). Meta Custom Audience uploads
must be SHA-256 hashed (handled in `visitors-sync-meta.js`) and require that you
have a lawful basis / consent for the contacts uploaded.

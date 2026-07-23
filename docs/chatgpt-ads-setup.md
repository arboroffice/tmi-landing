# ChatGPT (OpenAI) Ads — Conversion Tracking Setup

TMI tracks ad conversions from OpenAI's advertising platform using the OpenAI Ads
pixel (client-side) plus the Conversions API (server-side). Both are wired.

- **Pixel ID:** `1SVHHxEVsMKxiFJd8MnXZm`
- **Primary event:** `lead_created`

---

## What's installed

### 1. Base pixel — on every page
The pixel loader + `oaiq("init", ...)` is in the `<head>` of all 254 site pages
(marketing pages, articles, and the OS auth/onboarding screens), so any page an ad
drives to can track the visitor and attribute a conversion.

```html
<script>!function(w,d,s,u){...}(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");
oaiq("init",{pixelId:"1SVHHxEVsMKxiFJd8MnXZm",debug:false});</script>
```

> `debug` is set to **false** for production. To watch events fire in the browser
> console while testing, temporarily change it to `true` on the page you're testing.

### 2. Conversion events — fired at the real conversion moments (client-side)

| Where | Event(s) | Fires when |
|---|---|---|
| `intelligence-assessment.html` (audit application) | `lead_created` | The application POSTs successfully |
| `os/index.html` (OS sign up) | `registration_completed` + `lead_created` | Account is created |
| `intelligence-scorecard.html` | `lead_created` | The visitor starts the scorecard (email captured) |
| `book.html` (Cal.com) | `lead_created` | A call is booked (Cal `bookingSuccessful`) |

Each call looks like:
```js
oaiq("measure", "lead_created", { type: "customer_action", event_id: eid });
```

### 3. Conversions API — server-side backup (deduped)
Ad blockers and privacy settings drop a meaningful share of client pixel events.
So the two highest-value conversions also fire **from the server**, which no
blocker can stop:

- **Audit application** → `api/assessment-apply.js`
- **OS sign up** → `api/os2-signup.js`

Both call `api/_oaiq.js` → `fireLead()`, which POSTs to the Conversions API:
```
POST https://bzr.openai.com/v1/events?pid=1SVHHxEVsMKxiFJd8MnXZm
Authorization: Bearer <OPENAI_ADS_API_KEY>
{ "events": [ { "id": "<event_id>", "type": "lead_created", "timestamp_ms": ..., "action_source": "web", "data": { "type": "customer_action" } } ] }
```

**Deduplication:** the browser generates one `event_id`, sends it to the server in
the form/signup payload, and both the pixel and the server use the same id. OpenAI
counts the pair once. If the client event was blocked, the server event stands
alone — so you capture the conversion either way, never double.

---

## What you need to do

**The client pixel and events work right now** — nothing required.

**To turn on the server-side backup** (recommended), add one env var in Vercel:

```
OPENAI_ADS_API_KEY=<your OpenAI Ads Conversions API key>
```

Get the key from your OpenAI Ads account (Conversions API / server events). Until
it's set, `fireLead()` is a no-op — safe to have deployed. Once set, server events
start flowing automatically. No redeploy of logic needed beyond the env var.

---

## Verifying it works

1. **Client:** open a page (e.g. `/intelligence-assessment`), temporarily set
   `debug:true` in that page's `oaiq("init", ...)`, submit the form, and watch the
   browser console for the `lead_created` measure call. Or check your OpenAI Ads
   events dashboard for incoming events.
2. **Server:** with `OPENAI_ADS_API_KEY` set, submit the audit form and confirm the
   event appears in the OpenAI Ads dashboard. To test without recording, the API
   supports `"validate_only": true` (flip it in `_oaiq.js` temporarily).

---

## Adding a conversion elsewhere

On any page (the base pixel is already present), fire:
```js
if (window.oaiq) oaiq("measure", "lead_created", { type: "customer_action" });
```
For a server-side copy, generate an `event_id` in the browser, send it to your
endpoint, and call `require('./_oaiq').fireLead({ eventId, sourceUrl })` after the
work succeeds.

---

## Files

- Base pixel: injected in `<head>` of every `*.html` (root) and `os/*.html`
- Client events: `intelligence-assessment.html`, `os/index.html`,
  `intelligence-scorecard.html`, `book.html`
- Server helper: `api/_oaiq.js` (`fireLead`)
- Server wiring: `api/assessment-apply.js`, `api/os2-signup.js`
- Env var: `OPENAI_ADS_API_KEY` (optional; enables server-side)

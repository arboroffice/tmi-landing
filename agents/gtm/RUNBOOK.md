# TMI Outbound — Runbook (turn it on)

The agentic SDR is built. This is the one-time setup and the safe rollout.

## 1. Environment variables

Set these as GitHub Actions secrets (for the scheduled run) and in Coolify (for the
site + `/api`). Same names in both.

**Required to run:**
| Var | What |
|---|---|
| `ANTHROPIC_API_KEY` | research + audit + blueprint agents |
| `APOLLO_API_KEY` | ICP prospecting + email reveal |
| `FIREBASE_SERVICE_ACCOUNT` | leads, audits, runs, suppression (raw JSON or base64) |
| `INSTANTLY_API_KEY` + `INSTANTLY_CAMPAIGN_ID` | sending + the sequence |
| `JWT_SECRET` | admin auth |

**Strongly recommended:**
| Var | What |
|---|---|
| `OUTREACH_ADDRESS` | your physical mailing address (CAN-SPAM) |
| `OUTREACH_CC` | CC yourself during break-in (remove later) |
| `NEVERBOUNCE_API_KEY` | email verification (else MX-only) |
| `QSTASH_TOKEN` | booking -> auto-prep brief |
| `GTM_DIGEST_EMAIL` | daily briefing + blueprint recipient |
| `RESEND_OUTREACH_API_KEY` + `OUTREACH_FROM_EMAIL` | fallback send + the unsubscribe domain |

**Optional channels / controls:**
| Var | What |
|---|---|
| `AUTO_REPLY=true` | autonomous reply -> booking |
| `INSTANTLY_WEBHOOK_SECRET` | secure the reply webhook |
| `LINKEDIN_WEBHOOK_URL` (+`_SECRET`) | LinkedIn channel (HeyReach/Expandi/etc.) |
| `BOOK_URL` | callback-request page (default `https://www.tmitechai.com/book`) - prospects request a call, we reach out; no instant Cal.com booking |
| `GTM_LEADS_PER_DAY` / `GTM_DRY_RUN` | batch size / dry run |
| `GTM_SOURCE` | `apollo` (default) or `maps` |

## 2. Connect the channels

- **Instantly:** build the campaign + sequence using merge fields `{{first_name}}`,
  `{{company_name}}`, `{{audit_link}}`, `{{audit_card}}`, `{{intel_score}}`,
  `{{primary_bottleneck}}`. Warm the inboxes (2-3 weeks). Point the campaign's
  "reply received" webhook at `https://www.tmitechai.com/api/instantly-webhook?secret=<INSTANTLY_WEBHOOK_SECRET>`.
- **Cal:** already wired — bookings hit `api/booking-confirmed` -> auto-prep.
- **LinkedIn (optional):** set `LINKEDIN_WEBHOOK_URL` to your tool's inbound webhook.

## 3. Safe rollout (each step is a button or a setting)

1. **Send test** (admin) -> confirm the email + audit page + card render.
2. **Dry run (5)** (admin) -> read those 5 audits in Prospects (status `audited`). Tune
   `ICP.industryKeywords` / `employeeRanges` in `config.js` if the fit is off.
3. Set `OUTREACH_CC=you`, `GTM_LEADS_PER_DAY=10`, let it actually send 10/day for a few
   days while Instantly warms. Watch **Campaign health** + **Funnel** in admin.
4. Turn on `AUTO_REPLY=true`. Watch the first ~20 auto-replies (you're CC'd).
5. Remove `OUTREACH_CC`, set `GTM_LEADS_PER_DAY=100`. Open the **daily briefing** and
   show up to the booked calls.

## 4. Daily operation (hands-off)

- The GitHub Action runs every weekday (or trigger from admin "Run outbound now").
- You get one **daily briefing** email: today's numbers, funnel, calls booked, hot accounts.
- After a discovery call: hit **Proposal** on the prospect to draft the build proposal (scopes the Intelligent Company OS, emailed to the team).
- Manage everything at **admin.tmitechai.com/outbound** (runs, funnel, prospects, suppression).

## 5. Guardrails (already on)

- Suppression: never contacts your domains, opt-outs, or the do-not-contact list.
- Email verification before send. CAN-SPAM address + one-click unsubscribe on every email.
- Dry-run + CC for safe break-in.

## 6. Watch these (the non-code realities)

- **Deliverability** (Instantly): open/reply/bounce in admin. Bounce > 3% = slow down.
- **Apollo credits:** ~100 reveals/day. Top up before scaling.
- **Claude spend:** research + audit are Sonnet (~2 calls/lead). Drop research to Haiku to cut cost.

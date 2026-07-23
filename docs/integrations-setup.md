# TMI OS — Integrations Setup Guide

How to connect everything in the catalog: OAuth apps, API keys, banking, and MCP
servers. This is the master reference for wiring a provider so a client's numbers
go live and their workers can act.

The catalog ships **198 named tools across 34 categories**, plus **any MCP server**
by URL, plus **custom-integration requests** for anything else. Each connection
uses one of four mechanisms below.

---

## 0. Prerequisites (do these once, first)

| Item | Why | How |
|---|---|---|
| `OS_SECRETS_KEY` (Vercel env) | Encrypts every stored token/key in the vault (AES-256-GCM). Nothing stores safely without it. | Generate 32 random bytes as hex: `openssl rand -hex 32`. Paste into Vercel → Project → Settings → Environment Variables. Falls back to `JWT_SECRET` if unset, but set it explicitly. |
| Privacy policy + Terms URLs | Every OAuth app registration requires them | You have `/privacy` and `/terms` style pages; have the URLs ready |
| App name, logo, support email | Required in every developer portal | TMI logo + support@tmitechai.com |
| One redirect/callback base | Every OAuth provider needs an allowed redirect | `https://os.tmitechai.com/api/os2-oauth/<provider>/callback` |

**Read-only first.** Start every provider with read-only scopes (pull numbers).
Write access (send email, move money, create records) triggers heavier review
and should come after the client trusts the read side.

---

## 1. The four connection mechanisms

1. **API key / restricted key** — the customer pastes a read-only key; we store it
   encrypted and pull on the sync schedule. **Live today: Stripe.** Simplest, no
   OAuth app to register. Good for Stripe, and anything that issues restricted keys.
2. **OAuth 2.0** — the customer clicks Connect, authorizes on the provider, we get
   tokens and refresh them. Needs a registered app (client id + secret + redirect).
   For: QuickBooks, Xero, HubSpot, Salesforce, Slack, Google, Microsoft, most SaaS.
3. **Aggregator (banking)** — banks do not issue OAuth apps. A customer connects
   their bank through **Plaid** (recommended) via the Plaid Link widget. We store
   the resulting token and pull balance/transactions.
4. **MCP server** — the customer pastes a Model Context Protocol server URL (+
   optional token). We handshake, discover its tools, and wire them into workers.
   **Live today: connect + tool discovery.**

---

## 2. What every OAuth provider needs (the pattern)

For each OAuth provider you register a developer app and hand over two secrets:

- **Client ID** and **Client Secret** → set as Vercel env vars (never in code)
- **Redirect URI** registered on the provider: `https://os.tmitechai.com/api/os2-oauth/<provider>/callback`
- **Scopes** (start read-only)
- Provider-specific extras noted in the table below

Once the env vars exist, the OS handles the rest (authorize → callback → token
exchange → encrypted storage → refresh → scheduled pull).

---

## 3. Money & finance

| Provider | Portal | Mechanism | You provide | Scopes / products | Notes |
|---|---|---|---|---|---|
| **Stripe** | dashboard.stripe.com | API key (live) or OAuth (Connect) | Restricted key, or `STRIPE_CONNECT_CLIENT_ID` for OAuth | Read: Balance, Charges | Paste-key flow is live now |
| **Plaid (banking)** | dashboard.plaid.com | Aggregator (Link) | `PLAID_CLIENT_ID`, `PLAID_SECRET` (sandbox + prod), redirect URI | Balance, Transactions, Auth | Production access review (days–weeks); build against sandbox meanwhile |
| **QuickBooks** | developer.intuit.com | OAuth 2.0 | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, environment | `com.intuit.quickbooks.accounting` | App assessment before production |
| **Xero** | developer.xero.com | OAuth 2.0 | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | `accounting.reports.read`, `accounting.transactions.read`, `offline_access` | Light review for private/custom |
| **Mercury / Brex / Ramp** | each dashboard → API | API key | Read key | Balances, transactions | Read-only keys |
| **Bill.com** | developer.bill.com | API key + org | Key, org id | AP/AR read | |
| **NetSuite / Sage Intacct** | account admin | OAuth / token | Token set | GL/AR read | Enterprise; per-account setup |

---

## 4. Trades, field service & construction

Most of these are **OAuth 2.0** or **API key** and read-only to start (jobs,
invoices, revenue, schedule). Register the app in each provider's developer portal,
set client id/secret as env vars, and use the standard redirect URI.

| Provider | Portal / path | Mechanism | Typical reads |
|---|---|---|---|
| ServiceTitan | developer.servicetitan.io | OAuth + app key | Jobs, revenue, invoices, techs |
| Jobber | developer.getjobber.com | OAuth 2.0 | Jobs, quotes, invoices, clients |
| Housecall Pro | Partner/API program | API key | Jobs, revenue, schedule |
| FieldEdge / Workiz / ServiceFusion / FieldPulse / BuildOps / Simpro / Tradify | each API program | OAuth or key | Jobs, invoices, dispatch |
| Procore | developer.procore.com | OAuth 2.0 | Projects, budgets, RFIs, daily logs |
| Buildertrend / CoConstruct / Knowify / Contractor Foreman | each API | OAuth or key | Jobs, budgets, schedules |
| Autodesk Construction Cloud | aps.autodesk.com | OAuth 2.0 | Projects, issues, files |
| CompanyCam | app.companycam.com/developers | OAuth / key | Job photos, projects |
| STACK / PlanSwift / ProEst | each API | key / OAuth | Estimates, takeoffs |
| JobNimbus / AccuLynx / Roofr | each API | key / OAuth | Jobs, estimates, pipeline |
| Samsara / Motive / Verizon Connect / Geotab / Fleetio | each developer portal | API token | Vehicle location, hours, maintenance |
| SafetyCulture / KPA | developer portal | API token | Inspections, incidents |
| Tenna / ToolWatch / Point of Rental / EquipmentShare | each API | key | Equipment location, utilization |

> These providers vary in how open their APIs are. Some are self-serve (get a key
> in minutes); some (ServiceTitan, Procore) require a developer/partner account.
> When one is not self-serve, the client's **custom integration request** captures
> it and TMI coordinates access.

---

## 5. Manufacturing & ERP

| Provider | Mechanism | Notes |
|---|---|---|
| Fishbowl / Katana / MRPeasy | API key | Inventory, orders, production |
| Epicor / Infor / SAP | OAuth / token | Enterprise; per-deployment setup |
| Odoo | API key / XML-RPC | Self-hosted or cloud |

---

## 6. Sales, commerce & fulfillment

| Provider | Portal | Mechanism | Scopes (read) |
|---|---|---|---|
| HubSpot | developers.hubspot.com | OAuth 2.0 | `crm.objects.*.read`, `crm.schemas.*.read` |
| Salesforce | Setup → App Manager → Connected App | OAuth 2.0 | `api`, `refresh_token`, `offline_access` |
| Pipedrive / Zoho / Close / Copper / Keap | each dev portal | OAuth 2.0 | Deals, contacts, pipeline read |
| Shopify | shopify.dev | OAuth 2.0 | `read_orders`, `read_products`, `read_customers` |
| WooCommerce | store → REST API keys | API key/secret | Orders, products |
| BigCommerce / Squarespace / Wix / Magento | each API | OAuth / key | Orders, revenue |
| Amazon Seller | Seller Central → Develop apps (SP-API) | OAuth (LWA) | Orders, settlements |
| ShipStation / ShipBob / Gorgias | each API | key / OAuth | Shipments, tickets |

---

## 7. POS, hospitality, health & wellness

| Provider | Mechanism | Reads |
|---|---|---|
| Toast | Partner API (OAuth) | Sales, labor, menu |
| Square | OAuth 2.0 | Payments, orders, inventory |
| Clover / Lightspeed | OAuth 2.0 | Sales, inventory |
| 7shifts / Homebase | OAuth / key | Schedules, labor |
| Boulevard / Mangomint / Vagaro / Mindbody / Zenoti | each API/partner | Appointments, revenue, clients |
| Jane / SimplePractice | each API | Appointments, billing (health data — mind compliance) |

> Health providers touch PHI. Keep integrations read-only and check each
> provider's data terms before wiring anything beyond aggregate numbers.

---

## 8. Online, creators & agencies

| Provider | Portal | Mechanism | Reads |
|---|---|---|---|
| YouTube | console.cloud.google.com (Data API) | OAuth 2.0 | Views, subs, revenue |
| Instagram / Meta Ads | developers.facebook.com | OAuth 2.0 | Insights, ad spend/results |
| TikTok | developers.tiktok.com | OAuth 2.0 | Video + ad metrics |
| Substack / Beehiiv / Kit / Kajabi / Teachable / Gumroad / ThriveCart | each API | key / OAuth | Subscribers, revenue, sales |
| Patreon | patreon.com/portal | OAuth 2.0 | Patrons, pledges |
| Buffer / Later / Hootsuite / Metricool / Sprout Social | each API | OAuth | Post + engagement metrics |
| Harvest / Toggl / Float / Basecamp / Teamwork | each API | OAuth / key | Time, utilization, projects |
| Carta / Pulley / AngelList / DocSend / Causal | each API | OAuth / key | Cap table, docs, model outputs |

---

## 9. Everyday tools (comms, calendar, storage, marketing, support)

| Provider | Portal | Mechanism | Heads-up |
|---|---|---|---|
| Google Workspace (Gmail/Calendar/Sheets/Drive/Analytics) | console.cloud.google.com | OAuth 2.0 | Gmail scopes need Google verification + possible CASA security assessment (weeks, can cost). Sheets/Calendar read-only is lighter. |
| Microsoft 365 (Outlook/Teams/OneDrive) | Azure AD app registration | OAuth 2.0 | Graph permissions + admin consent per tenant |
| Slack | api.slack.com/apps | OAuth 2.0 | Bot + read scopes; distribution review only for public listing |
| Twilio / RingCentral / OpenPhone / Aircall / Dialpad | each console | key / OAuth | Calls, messages |
| Mailchimp / Klaviyo / ActiveCampaign | each API | key / OAuth | Campaigns, list size, revenue |
| Zendesk / Intercom / Freshdesk / Help Scout | each API | OAuth / key | Tickets, CSAT |
| DocuSign / PandaDoc / Dropbox Sign | each API | OAuth | Envelopes, status |
| Dropbox / Box | each API | OAuth 2.0 | Files, folders |
| Zapier / Make / n8n | webhook | — | These push into the OS ingest endpoint; no OAuth needed |

**Zapier/Make/n8n and any webhook-capable tool** need no OAuth at all — point them
at the OS ingest endpoint (Live data → Push numbers in from any tool) with the
tenant's ingest key. This is the fastest way to connect a long-tail tool today.

---

## 10. Banking in detail (Plaid)

1. Sign up at **dashboard.plaid.com** → immediate **Sandbox** keys (fake banks).
2. Enable products: **Balance** (cash on hand), **Transactions** (cash flow),
   optionally **Auth** (account/routing), **Liabilities**.
3. Register redirect URI: `https://os.tmitechai.com/api/os2-oauth/plaid/callback`.
4. Request **Production access** in the dashboard (reviews company + use case;
   days to weeks). Build against sandbox meanwhile.
5. Flow: **Plaid Link** widget (not a raw redirect) → customer picks their bank and
   logs in inside Plaid → we exchange the public token for an access token → store
   encrypted → pull balance/transactions on the sync cron (same as Stripe).

**Compliance:** Plaid holds the bank credentials, so TMI never sees them. TMI does
store tokens + financial data, so keep a clear data-handling stance; Plaid's
production review and MSA formalize it.

---

## 11. MCP servers (unlimited, live now)

Live data → **Connect an MCP server**. The owner pastes:
- **Name** (optional), **Server URL**, **Auth token** (optional).

The OS runs a real MCP handshake (`initialize` + `tools/list`), discovers the
server's tools, and stores the connection (token encrypted in the vault, never
returned). Refresh re-discovers tools; Remove deletes the connection and token.

This is how a client connects **anything** that exposes an MCP server, the same
open standard Claude uses — no per-provider app required. Worker execution of MCP
tools is the next build (it plugs into the tool-execution path).

---

## 12. Environment variables summary

Set these in Vercel as you enable each provider (only what you use):

```
OS_SECRETS_KEY=<openssl rand -hex 32>        # required, encrypts the vault
PLAID_CLIENT_ID= / PLAID_SECRET=             # banking
QBO_CLIENT_ID= / QBO_CLIENT_SECRET=          # QuickBooks
XERO_CLIENT_ID= / XERO_CLIENT_SECRET=
HUBSPOT_CLIENT_ID= / HUBSPOT_CLIENT_SECRET=
SF_CONSUMER_KEY= / SF_CONSUMER_SECRET=        # Salesforce
SLACK_CLIENT_ID= / SLACK_CLIENT_SECRET=
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=
MS_CLIENT_ID= / MS_CLIENT_SECRET=
STRIPE_CONNECT_CLIENT_ID=                     # optional OAuth Stripe
OS_ENABLE_LABS=1                              # opens the connector/tool endpoints when wiring
```

Hand TMI the **client id + secret** for any provider (or set them yourself and
share only the variable names). Secrets never need to be pasted into code.

---

## 13. Recommended sequence

1. `OS_SECRETS_KEY` in Vercel.
2. **Stripe** (live now — paste a restricted key) to prove the loop end to end.
3. **Plaid sandbox** → build banking against fake banks while production review runs.
4. **QuickBooks + Xero** (accounting, free/fast).
5. Industry stack for your core verticals (ServiceTitan/Jobber, Procore, etc.).
6. **Google/Microsoft** last (heaviest review), minimal scopes.
7. **MCP + custom requests** cover the long tail from day one.

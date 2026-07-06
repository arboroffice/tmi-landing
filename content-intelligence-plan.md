# TMI Signal — Content Intelligence & Creative Cloning Engine

**Run by Mia from admin.** Point it at a niche or a client, and it deploys a swarm
of scanning agents across every platform to find the content already winning
attention from qualified buyers, extracts the hook / messaging / format / sound
that makes it work, then recreates that winning content in the client's own
messaging and hands it to the calendar. It watches continuously, so the library
never goes stale.

This is the same "300 agents scanning the market" engine that already powers the
**Marketing Intelligence** and **Competitor Intelligence** sections of the
Business Intelligence Audit. Signal turns it into a standalone product Mia runs.

> The strategy in one line: stop interrupting people with ads and cold outreach.
> Find what they're already stopping the scroll for, and rebuild it around the
> client's offer.

---

## What Mia does (the admin experience)

1. **Pick a target.** Choose a client (or a raw niche + geography). Signal already
   knows the client's offer and voice from their audit and onboarding.
2. **Launch a scan.** One button: "Scan this market." The swarm fans out across
   platforms and search angles. Progress shows live (agents running, posts found).
3. **Read the board.** A ranked "What's working right now" board: the top reels,
   images, and carousels in that niche, each with its hook, format, sound, the
   angle it's playing, and *why* it's an outlier (engagement velocity vs. the
   account's own baseline, not just raw likes).
4. **Clone the winners.** Click "Recreate for [client]" on any winning piece.
   Signal writes a shot-for-shot brief in the client's messaging, generates the
   creative (script + on-screen text + image/video), and shows a side-by-side:
   original pattern vs. the client's version.
5. **Prep and ship.** Approved creatives drop into the existing content calendar,
   scheduled and pointed at the client's offer (audit link, booking, landing page).
6. **Leave it watching.** Signal keeps re-scanning weekly and surfaces new winners
   and fading trends without Mia lifting a finger.

New admin surface: **`admin-signal.html`** (Content Intelligence), sitting next to
`admin-content-hub`. It reuses the existing content-calendar and compose tools for
scheduling, so nothing is rebuilt.

---

## The pipeline (six stages)

### 1. Ingestion — "the 300 agents"
A fan-out of scan workers across **platform × angle**. The "300" is real: it's the
product of the search surface we cover, each worker a separate scoped task.

- **Platforms** (Apify actors, already available in this environment):
  TikTok (`clockworks/tiktok-scraper`), Instagram reels + posts
  (`apify/instagram-reel-scraper`, `apify/instagram-post-scraper`), YouTube
  (`streamers/youtube-scraper`), Facebook/Instagram **Ads Library**
  (`curious_coder/facebook-ads-library-scraper`) for what competitors are paying
  to run, and Reddit/Google for demand language.
- **Angles per platform:** top hashtags for the niche, trending sounds, named
  competitors (from the audit), buyer keywords, and adjacent niches that convert
  the same buyer. Each angle is one worker → dozens of workers per platform →
  hundreds per run.
- **Orchestration:** the existing `agents/gtm/orchestrator.js` pattern, or a
  Workflow-style fan-out. Every worker is time-boxed and best-effort so one slow
  scraper never blocks the run. Results land in a `signal_posts` table.

### 2. Scoring — find the true outliers
Raw likes lie (big accounts always win). We rank by **outlier score**: a post's
engagement velocity relative to *its own account's median* and its recency. A
5k-follower account with a 400k-view reel is the signal; a celebrity's average
post is not. Also weight for **buyer fit** (is the audience actually the client's
ICP, not just big numbers). Output: a ranked shortlist per niche.

### 3. Pattern extraction — why it works (Claude)
For each top post, Claude reads the caption, on-screen text, transcript, and
format and returns structured JSON: **hook** (first 3 seconds), **format**
(talking-head / listicle / POV / green-screen / carousel), **sound**, **angle**
(the emotional or logical wedge), **offer/CTA**, and **why it stopped the scroll**.
This is the reusable "recipe," decoupled from the specific creator.

### 4. Messaging translation — into the client's voice
Claude maps each winning recipe onto the **client's offer and voice** (pulled from
their audit + onboarding brief). Same proven hook and structure, their message.
It never copies the original's words or claims. Output: a creative brief — script,
on-screen text beats, caption, hashtags, CTA to the client's offer.

### 5. Creative cloning — generate the asset
From the brief, generate the actual creative:
- **Reels / short video:** Higgsfield (`generate_video`, shorts/UGC workflows) or
  Replicate video models, driven by the brief's shot list and script; voiceover
  via Higgsfield audio.
- **Images / carousels:** Replicate or Higgsfield `generate_image` per slide,
  laid out to the client's brand tokens (the site already has a locked design
  system to match).
- **Human in the loop:** Mia reviews the side-by-side and approves, edits the
  brief, or regenerates. Nothing publishes without her.

### 6. Prep, schedule, and watch
- Approved assets flow into `admin-content-calendar` / `content-posts`, scheduled
  and linked to the client's offer.
- A weekly cron re-runs the scan per active client, flags new winners and dying
  trends, and refreshes the board. Mia gets a digest: "3 new winning formats in
  [niche] this week."

---

## Data model (new tables)

- **`signal_runs`** — one scan: client/niche, platforms, angle count, status, counts.
- **`signal_posts`** — every scraped post: platform, url, creator, metrics,
  account-baseline, outlier score, buyer-fit, raw media ref.
- **`signal_recipes`** — extracted patterns: hook, format, sound, angle, CTA,
  linked to the source post, reusable across clients.
- **`signal_creatives`** — generated assets: client, source recipe, brief, media
  URLs, status (draft / approved / scheduled / posted), performance once live.

---

## Build phases

**Phase 0 — Intelligence board (read-only).** Ingestion + scoring + pattern
extraction for one platform (start with Instagram reels or TikTok) and one niche.
Ship `admin-signal.html` as a ranked "what's working" board. *This alone is
valuable and also upgrades the audit's Marketing/Competitor Intelligence sections
with live data.* Lowest risk, fastest proof.

**Phase 1 — Full swarm.** Add the other platforms and the Ads Library, the
angle fan-out, buyer-fit scoring, and the weekly watch cron + digest.

**Phase 2 — Messaging translation.** Client voice/offer mapping → creative briefs,
with the side-by-side original-vs-client view. Still no generation, just briefs
Mia can hand to a creator.

**Phase 3 — Creative cloning.** Wire Higgsfield/Replicate to generate the reels,
images, and carousels from the brief. Review + approve → calendar.

**Phase 4 — Closed loop.** Track posted-creative performance, feed it back into
scoring so Signal learns which cloned patterns actually convert for TMI's clients,
and auto-prioritizes those.

---

## What it needs from you

- **Accounts + budget.** Apify (scraping actors, per-run cost), Higgsfield and/or
  Replicate (creative generation), and the Anthropic key already in use. Signal
  runs on paid API calls, so runs should be metered and launched deliberately, not
  auto-fired.
- **Platform reality.** Scraping and re-creation live inside each platform's terms
  and copyright law. Signal clones **format, hook, and structure** (not
  copyrightable) and writes original words and visuals. It does not repost or
  rip creators' actual footage, and sound usage follows each platform's licensed
  library. Worth a quick legal sign-off before Phase 3 goes live.
- **One decision to start:** which platform and which client/niche to prove Phase 0
  on. My rec: the niche where TMI already has the most audit data, so the board is
  grounded day one.

---

## How it connects to everything already built

- **The audit:** Signal's board is the engine behind the Business Intelligence
  Audit's Marketing and Competitor Intelligence sections. Same data, two surfaces.
- **Outbound:** the winning hooks and angles Signal finds become the messaging for
  the cold campaigns already running (`agents/gtm/outbound.js`, Instantly).
- **The client offer:** cloned content drives attention to the client's audit,
  booking, or landing page, closing the loop from "scroll" to "qualified lead."

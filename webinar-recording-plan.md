# The Intelligent Company Masterclass — Recording Plan

This is the plan for the single evergreen recording that powers the weekly
webinar at **/webinar** and plays in the room at **/watch**. Record it once.
It runs every Tuesday at 3:00 PM CST forever, plus on demand, until you decide
to refresh it.

The whole system is built so **nothing in the video is dated**. No "this week,"
no "happy Tuesday," no current events, no model names that will age. You teach a
**framework**, and a framework stays true no matter how fast the tools change.

---

## The one job of this recording

Take an owner of a $5M+ operations-heavy business who feels like the bottleneck,
and by minute 40 make them believe two things:

1. Their chaos is not a software problem, it is a **systems** problem, and it is
   solvable.
2. The clearest next step is the **free Business Intelligence Audit**.

Everything below serves those two beliefs.

---

## Format and tech setup

- **Length:** 40 minutes. The room is hard-coded to a 40-minute run
  (`DURATION_SEC` in `watch.html`). If you change the length, change that value.
- **Host:** founder on camera (Mia and/or Tyler). Talking head + screen share.
  One real face beats a slick faceless deck for trust.
- **Look:** shoot clean and simple. Neutral background, good key light, a decent
  mic (a lav or a Shure MV7 class mic). 1080p is plenty. Landscape 16:9.
- **Screen share:** you will show a real command-center view and a couple of
  before/after diagrams. Use the actual dashboards on the site
  (`dashboard-*.webp`) so the webinar and the site tell the same story.
- **Record in segments** so you can swap the intro or outro later without
  re-recording the core: **Intro (0:00-3:00)**, **Core (3:00-36:00)**,
  **Close (36:00-40:00)**. Keep the core untouched for 6-12 months; refresh the
  intro/outro to mention new features or milestones.
- **No dead air at the start.** The room auto-plays and late-joiners are dropped
  in at the correct spot, so the first 20 seconds must already be content, not
  "can everyone hear me."

---

## Upload and go live (once it's recorded)

1. Upload the final cut to **YouTube as Unlisted** (free, reliable, seekable) or
   push an MP4 to a CDN (Cloudflare Stream / R2, Bunny, or Mux).
2. Open `watch.html` and set **one** of:
   - `var WEBINAR_YT_ID = 'yourVideoId';`  (the unlisted YouTube id), or
   - `var WEBINAR_MP4 = 'https://cdn.tmitechai.com/masterclass.mp4';`
3. Confirm `DURATION_SEC` matches the final runtime and `CTA_AT_SEC` matches the
   moment you say "here's your next step" (currently **24:00**).
4. Push to `main`. That's it — the weekly loop and the reminder emails already
   run themselves.

---

## The chat is scripted to the video

The room plays a **simulated live chat** timed to the recording (in
`watch.html`, the `CHAT` array). The comments are written to land right after you
make each point. If you move a beat, move its chat cue. Current cues:

| Time | Chat beat |
|------|-----------|
| 0:08 | Host: "Welcome in, drop your industry and size" |
| 0:26-1:10 | Attendees name themselves (HVAC, electrical, "everything runs through me") |
| 2:30 | Host: "That's the problem we're taking apart — three systems" |
| 4:00-6:00 | "9 apps and none talk to each other," "single source of truth just hit" |
| 15:00 | "command layer is basically our whole ops meeting on one screen" |
| 20:00 | Host: "free audit link is coming up" |
| **24:00** | **CTA card appears on screen** + "booking the audit now" |
| 36:40 | Host: "last few minutes, get your questions in" |

Your spoken content should track these so the chat feels like a real reaction.

---

## The 40-minute script

Beats, not a word-for-word teleprompter. Keep it in TMI voice: direct, no
hedging, real numbers, no "leverage AI." Talk about **systems and operations**,
never "AI will solve this."

### 0:00-3:00 — Intro (swappable segment)
- Open cold on the pain, not on yourself: *"If your business stops moving the day
  you take off, you don't have a company yet. You have a job that pays worse than
  it should and never lets you leave. In the next 40 minutes I'm going to show
  you the exact system that fixes that."*
- One sentence of who you are and who you've built this for: owners of $5M+
  trades, industrial, field-service, and manufacturing operations.
- Promise the payoff and the structure: *"Three systems. By the end you'll know
  which one is leaking the most money in your business right now."*
- Set the frame: *"This is not a software pitch. Software is why you have nine
  apps and still answer every question yourself."*

### 3:00-9:00 — Why it breaks (the diagnosis)
- Tell the universal story: the business grew, and somewhere along the way **you
  became the system** — the memory, the dispatcher, the final say.
- Name the symptom stack in concrete terms: texts at 9pm, the estimate that sat
  for a week, the job that closed but nobody invoiced, the report that takes a
  half-day to pull together.
- The key reframe: *"More software made it worse. Every tool you bought added a
  login, not an answer."* This is an **operations** problem, not a tools problem.
- Land the stakes with a number: *"The average operation we look at is leaking
  somewhere between five and fifteen percent of revenue through this — not to
  competitors, to friction."*

### 9:00-24:00 — The three systems (the framework, the core)
This is the spine. Same three systems as the /webinar page, so the site and the
webinar reinforce each other. Spend ~5 minutes each, and for each one do:
**the problem it kills → what it looks like built → the before/after.**

- **System 1 — The single source of truth (9:00-14:00).** Every job, number, and
  conversation in one place. The answer to any question lives in the system, not
  in your head. Before: three spreadsheets, a whiteboard, and your memory. After:
  anyone can answer "where does this job stand" without calling you.

- **System 2 — The digital workforce (14:00-19:00).** The repeatable work —
  intake, follow-up, scheduling, invoicing — handled by systems that never forget
  and never take a day off. Before: leads die overnight, invoices go out late.
  After: the work routes itself and nothing waits on a person to remember.

- **System 3 — The command layer (19:00-24:00).** The whole operation on one
  screen, in real time. You lead by looking, not by chasing people for updates.
  Screen-share the real dashboard here. Before: the Monday scramble to find out
  what happened last week. After: you already know, live.

At **~24:00**, right as you finish the command layer, deliver the transition
line — **this is where the on-screen CTA card appears**:
> *"If you want us to do this to your operation, the first step is free. We map
> how your business runs today and show you exactly where it's leaking. It's
> called the Business Intelligence Audit, and the link is on your screen now."*

### 24:00-36:00 — Find your leak + proof
- Give them something to do: a 60-second self-diagnosis — of the three systems,
  which one, if it worked tomorrow, would give you back the most time? That's
  where you start.
- Walk one real before/after transformation in operational terms (no invented
  client names or fake ROI — use the honest pattern: "a contractor we worked
  with," the specific manual steps removed, the specific thing that changed).
- Handle the three objections out loud: *"How long?"* (built in 30 days),
  *"Do I replace all my tools?"* (no — delete, connect, build; most owners pay
  for less software after), *"What if my team won't use it?"* (we build around how
  they already work).
- Reinforce the audit as the on-ramp, not a sales trap: *"Genuinely free, no
  pitch, about 15 minutes of your time, and you walk away with a 30-day plan
  whether or not you ever hire us."*

### 36:00-40:00 — Close (swappable segment) + Q&A
- Recap the three systems in one breath.
- The emotional close, tied to the hero line of the whole brand: *"Stop being the
  system. Build the company you'll own instead of the one that owns you."*
- Clear final instruction: *"Book the audit. The link's on your screen and it's
  in your email."*
- Roll a short scripted Q&A of the three questions owners actually ask (cost,
  timeline, team adoption) so the tail of the video answers objections while the
  chat invites live questions.

---

## Refresh loop (quarterly)

- Watch your drop-off point in analytics. If people leave at, say, minute 20,
  tighten minutes 15-22 without touching the rest.
- Swap the **intro** or **close** segment to mention a new feature, a new
  industry, or a milestone. Never re-shoot the whole thing just to sound current.
- Keep the three-systems core stable. It is the part that ages the slowest and
  does the most work.

# TMI Cold Outbound Sequence — paste into Instantly

The daily cron pushes qualified leads into your Instantly campaign; Instantly owns
the sending and this sequence. Paste these five emails into the campaign's steps,
in order, at the day intervals below. Plain text only, no images, no links until
step 4 (protects deliverability).

**Merge fields available** (set by the send job): `{{firstName}}`, `{{companyName}}`,
`{{city}}`, `{{industry}}`. Instantly falls back gracefully if one is missing.

Voice: calm, direct, plain words. No hype, no "AI." Lead with the free audit, not the build.

---

## Step 1 — Day 0 · the shift

**Subject:** quick idea for {{companyName}}

Hi {{firstName}},

Most owners we work with built a good business and then slowly became the system. Every job, every number, every decision runs through them, and growth just makes it heavier.

We rebuild companies like {{companyName}} so the operation runs on systems instead of on you. It starts with a free Business Intelligence Audit: a 30-minute look at where your time and money are leaking, and a 30-day plan to fix it.

No pitch, no cost. Worth a look?

Mia
TMI

---

## Step 2 — Day 3 · bump

**Subject:** re: quick idea for {{companyName}}

Hi {{firstName}},

Floating this back up.

The audit is free and takes about 30 minutes. Worst case, you walk away with a clear roadmap of where the money is leaking. Best case, we build the version of {{companyName}} that runs without you in the middle of everything.

Want me to send a time?

Mia

---

## Step 3 — Day 6 · industry opportunity

**Subject:** what the best {{industry}} operators are doing

Hi {{firstName}},

The {{industry}} companies pulling ahead right now are not the ones with the most people. They are the ones that put the whole operation on one system: jobs, scheduling, and money in one place, with a screen that shows the owner everything live.

That is the shift we build. The free audit shows you exactly what it would look like for {{companyName}}, and what it is worth in time and profit.

Open to it?

Mia

---

## Step 4 — Day 10 · what it looks like (first link)

**Subject:** the version of {{companyName}} that runs itself

Hi {{firstName}},

Picture this: work routes itself, every job is tracked start to finish, invoices go out on time, and you can see the whole operation from your phone. No one texting you for answers all day.

That is an intelligent company, and it is built in about 30 days. You own it.

Here is the free audit if you want to see where {{companyName}} stands today: https://tmitechai.com/audit

Mia

---

## Step 5 — Day 14 · open door

**Subject:** should I close this out?

Hi {{firstName}},

I will stop here so I am not cluttering your inbox.

If getting {{companyName}} to run without you ever moves up the list, just reply and I will set up the free audit. The door stays open.

Mia
TMI · tmitechai.com

---

### Notes
- Set the Instantly campaign's own daily send limit to match your warmed inbox count (the cron caps new adds at 50/day; keep sends healthy).
- Keep steps 1-3 link-free. Step 4 introduces the one link, step 5 has only the domain.
- If you enrich named decision-makers later, the same sequence works; volume just goes up.

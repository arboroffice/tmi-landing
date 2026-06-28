// Onboarding Agent — turns a closed deal into a moving onboarding.
//
// Finds clients that just became clients but have not been onboarded yet, writes
// each a personalized onboarding plan plus a warm welcome email in TMI voice, opens
// an onboarding record and a small checklist of first-week tasks, emails the client
// the welcome and the access/intake request, then marks the client as started so it
// is never onboarded twice.
//
//   import { runOnboarding } from './onboarding.js';
//   const stats = await runOnboarding({ limit: 10 });
//
// CLI:  node agents/gtm/onboarding.js [limit]
//
// Every external path (LLM, email, db) is guarded: missing ANTHROPIC_API_KEY,
// FIREBASE creds, or data degrades to a graceful no-op and still returns stats.

import { fileURLToPath } from 'url';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { sendEmail } from './tools/email.js';

// Clients in any of these statuses are considered "won" and eligible for onboarding.
const CLIENT_STATUSES = ['client', 'won', 'building', 'signed'];

// The first-week checklist. Plain prose titles, no listicle, no emojis.
const TASK_TEMPLATES = [
  'Collect logins and tool access',
  'Export current data',
  'Name a point of contact',
  'Schedule the kickoff call',
];

let _anthropic;
function llm() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

const nowIso = () => new Date().toISOString();
const firstName = (c) => (c && (c.first_name || (c.name || '').split(' ')[0])) || 'there';

// Pull the eligible clients that have not been onboarded yet. Firestore can't express
// "status in set AND onboarding_started_at is null", so query per-status and filter in JS.
async function findClientsToOnboard(limit) {
  const seen = new Set();
  const out = [];
  for (const status of CLIENT_STATUSES) {
    let rows = [];
    try {
      rows = await db.list('clients', {
        where: [['status', '==', status]],
        order: 'created_at', ascending: false, limit: 300,
      });
    } catch (e) {
      console.warn('onboarding: list clients failed for status', status, e.message);
      continue;
    }
    for (const c of rows) {
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      if (c.onboarding_started_at) continue;
      out.push(c);
    }
  }
  return out.slice(0, limit);
}

// Hydrate the client's contact (clients link by contact_id).
async function loadContact(client) {
  if (!client || !client.contact_id) return null;
  try {
    return await db.getById('contacts', client.contact_id);
  } catch (e) {
    console.warn('onboarding: contact lookup failed for', client.id, e.message);
    return null;
  }
}

// Ask Sonnet for a plan + welcome email. Returns { plan, subject, body } or null on
// any failure (missing key, API error). Caller falls back to a static welcome.
async function generateOnboarding(client, contact) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const company = client.company || client.name || (contact && contact.company) || 'your company';
  const bought = client.product || client.plan || client.package || client.deal || 'the Intelligent Company OS build';
  const ctx = [
    `COMPANY: ${company}`,
    `CONTACT: ${firstName(contact)}`,
    `WHAT THEY BOUGHT: ${bought}`,
  ].join('\n');

  const system = `You are TMI's onboarding lead writing to a brand new client who just signed. TMI builds the Intelligent Company OS for operations-heavy businesses: delete software they do not use, connect what is left, build the backend the company runs on. Voice: direct, operator language, blunt, warm but no fluff. No AI hype, no "leverage AI", no emojis, no em dashes (use commas or periods). Write to an owner or operator, not a tech person.`;

  const content = `Write the onboarding for this new client.

${ctx}

Return exactly this format with these two markers and nothing else:

===PLAN===
A short onboarding plan in prose, 3 to 5 sentences. What happens in the first week: collecting their logins and tool access, exporting their current data, naming a single point of contact, and the kickoff call. Specific to ${company}, not generic.

===EMAIL_SUBJECT===
One line, under 60 characters, warm and direct.

===EMAIL_BODY===
A welcome email, 120 to 180 words. Open by welcoming ${firstName(contact)} and ${company} by name. Say plainly what happens next: we need their logins and tool access, an export of their current data, one point of contact named on their side, and a kickoff call on the calendar. Close with a clear ask to reply with those four things or a time for the call. Sign off as Mia at TMI. Plain text, short paragraphs.`;

  try {
    const msg = await llm().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content }],
    });
    const text = (msg && msg.content && msg.content[0] && msg.content[0].text) || '';
    return parseGenerated(text, client, contact);
  } catch (e) {
    console.warn('onboarding: LLM failed for', client.id, e.message);
    return null;
  }
}

function parseGenerated(text, client, contact) {
  const grab = (label, next) => {
    const re = new RegExp(`===${label}===\\s*([\\s\\S]*?)\\s*(?:===${next}===|$)`);
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  const plan = grab('PLAN', 'EMAIL_SUBJECT');
  const subject = grab('EMAIL_SUBJECT', 'EMAIL_BODY').split('\n')[0].trim();
  const body = grab('EMAIL_BODY', '\\$NONE');
  if (!plan && !body) return null;
  return {
    plan: plan || staticPlan(client, contact),
    subject: subject || staticWelcome(client, contact).subject,
    body: body || staticWelcome(client, contact).body,
  };
}

// Deterministic fallbacks so the agent still onboards when the LLM is unavailable.
function staticPlan(client, contact) {
  const company = client.company || client.name || 'the account';
  return `Onboarding for ${company} starts this week. First we collect logins and tool access, then export the current data out of the systems in use today. ${company} names one point of contact on their side, and we put a kickoff call on the calendar. Once those four are done, the build starts.`;
}

function staticWelcome(client, contact) {
  const company = client.company || client.name || 'your company';
  const name = firstName(contact);
  const subject = `Welcome to TMI, ${company}`;
  const body = [
    `${name}, welcome aboard. We are glad to have ${company} on the build.`,
    `Here is what happens next. We need four things to get moving: your logins and tool access, an export of your current data, one point of contact named on your side, and a kickoff call on the calendar.`,
    `Reply with those four things, or just send a couple of times that work this week and we will get the kickoff booked.`,
    `Talk soon,`,
    `Mia, TMI`,
  ].join('\n');
  return { subject, body };
}

export async function runOnboarding({ limit = 10 } = {}) {
  const stats = { scanned: 0, onboarded: 0, skipped: 0 };

  let clients = [];
  try {
    clients = await findClientsToOnboard(limit);
  } catch (e) {
    console.error('onboarding: scan failed:', e.message);
    await safeLogRun(stats);
    return stats;
  }

  for (const client of clients) {
    stats.scanned++;
    try {
      const contact = await loadContact(client);
      const company = client.company || client.name || (contact && contact.company) || 'New client';

      const gen = (await generateOnboarding(client, contact)) || {
        plan: staticPlan(client, contact),
        ...staticWelcome(client, contact),
      };

      // Open the onboarding record.
      try {
        await db.insert('onboarding', {
          client_id: client.id,
          company,
          stage: 'welcomed',
          plan: gen.plan,
          created_at: nowIso(),
        });
      } catch (e) {
        console.warn('onboarding: insert record failed for', client.id, e.message);
        stats.skipped++;
        continue;
      }

      // Open the first-week checklist tasks.
      for (const title of TASK_TEMPLATES) {
        try {
          await db.insert('onboarding_tasks', {
            client_id: client.id,
            title,
            status: 'open',
            created_at: nowIso(),
          });
        } catch (e) {
          console.warn('onboarding: task insert failed for', client.id, title, e.message);
        }
      }

      // Email the welcome plus the access/intake request.
      const to = (contact && contact.email) || client.email;
      if (to) {
        try {
          await sendEmail({
            to,
            toName: contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : undefined,
            subject: gen.subject,
            body: gen.body,
            cc: process.env.OUTREACH_CC || undefined,
          });
        } catch (e) {
          console.warn('onboarding: email failed for', client.id, e.message);
        }
      } else {
        console.warn('onboarding: no email for client', client.id, '- record opened, no send');
      }

      // Mark the client started so it never onboards twice.
      try {
        await db.update('clients', client.id, {
          onboarding_started_at: nowIso(),
          onboarding_stage: 'welcomed',
        });
      } catch (e) {
        console.warn('onboarding: mark client failed for', client.id, e.message);
      }

      stats.onboarded++;
    } catch (e) {
      console.warn('onboarding: client failed', client && client.id, e.message);
      stats.skipped++;
    }
  }

  console.log(`Onboarding: ${stats.onboarded} onboarded, ${stats.skipped} skipped (${stats.scanned} scanned)`);
  await safeLogRun(stats);
  return stats;
}

async function safeLogRun(stats) {
  try {
    await db.logRun({ kind: 'onboarding', ...stats });
  } catch (e) {
    console.warn('onboarding: logRun failed:', e.message);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '10', 10);
  runOnboarding({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

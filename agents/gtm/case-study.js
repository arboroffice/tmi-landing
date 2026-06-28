// Case-study / Testimonial / Referral agent — closes the flywheel.
//
// Wins become proof, proof becomes top-of-funnel. For each client with a delivered
// win and no case study yet, it drafts (a) a short operator-voice case study and
// (b) a warm testimonial-and-referral request email, stores the draft, and emails
// the request to the client. The reply gives you a testimonial to publish and an
// intro to one peer operator, which feeds the SDR pipeline.
//
//   import { runCaseStudies } from './case-study.js';
//   await runCaseStudies({ limit: 10 });
//
// CLI:  node agents/gtm/case-study.js [limit]
// HTTP: POST /api/case-study  ({trigger:true})

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendEmail, sendDigest } from './tools/email.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Clients that represent a delivered win worth turning into proof.
const WIN_STATUSES = new Set(['client', 'active', 'won', 'building']);
const STARTED_DAYS = 30; // a long-running engagement counts as a win even without metrics

const daysAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;

// Pull whatever results/metrics a client row carries, in a few likely shapes.
function resultsText(client) {
  const bits = [];
  const r = client.results || client.metrics || client.outcome || client.wins;
  if (Array.isArray(r)) bits.push(...r.map(String));
  else if (r && typeof r === 'object') bits.push(...Object.entries(r).map(([k, v]) => `${k}: ${v}`));
  else if (r) bits.push(String(r));
  if (client.savings_annual) bits.push(`Annual savings: $${Number(client.savings_annual).toLocaleString()}`);
  if (client.hours_per_week) bits.push(`Hours recovered: ${client.hours_per_week}/week`);
  return bits.filter(Boolean).join('; ');
}

function hasWin(client) {
  const status = String(client.status || '').toLowerCase();
  if (!WIN_STATUSES.has(status)) return false;
  if (resultsText(client)) return true;
  const started = client.started_at || client.start_date || client.created_at;
  return daysAgo(started) >= STARTED_DAYS;
}

// Draft the case study + the testimonial/referral email in one model call.
async function draftFor(client, contact) {
  const company = client.company || client.company_name || 'this operator';
  const firstName = (contact && contact.first_name) || 'there';
  const ctx = [
    `COMPANY: ${company}`,
    `INDUSTRY: ${client.industry || 'operations-heavy business'}`,
    `OWNER FIRST NAME: ${firstName}`,
    `WHAT TMI BUILT: ${client.scope || client.summary || 'the Intelligent Company OS — deleted dead software, connected what was left, built the backend the company runs on'}`,
    `RESULTS / METRICS: ${resultsText(client) || 'operation runs from one screen instead of scattered tools and paper'}`,
  ].join('\n');

  const system = `You are TMI writing for an industrial operator audience. TMI builds the Intelligent Company OS for trades and industrial companies: delete dead software, connect what is left, build the backend the company runs on. Write in plain operator voice. No hype, no "leverage AI", no buzzwords. No em dashes anywhere. No emojis. Specific and concrete over abstract. Return STRICT JSON only, no markdown fence.`;

  const content = `Using the facts below, produce two things.

${ctx}

Return a JSON object with exactly these keys:
{
  "case_study": "A short case study, 120 to 200 words, in three beats: the situation the operator was stuck in, what TMI built, and the outcome. Operator voice, concrete, no hype, no em dashes.",
  "email_subject": "A short, warm subject line for a testimonial and referral request. No em dashes.",
  "email_body": "A brief, warm email to ${firstName} at ${company}. Thank them for the work so far, ask for two lines they would be comfortable having quoted as a testimonial, and ask for an intro to one peer operator who has the same headaches. Plain text, short paragraphs, no em dashes, no emojis. Sign off as Mia at TMI."
}`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    system,
    messages: [{ role: 'user', content }],
  });

  const text = (msg.content && msg.content[0] && msg.content[0].text) || '';
  let parsed = null;
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : text);
  } catch { parsed = null; }
  if (!parsed || !parsed.case_study || !parsed.email_body) return null;
  // Belt-and-suspenders on the brand rule: never let an em dash through.
  const clean = (s) => String(s || '').replace(/—/g, ', ').replace(/–/g, '-');
  return {
    case_study: clean(parsed.case_study),
    email_subject: clean(parsed.email_subject) || `A quick favor, ${company}`,
    email_body: clean(parsed.email_body),
  };
}

export async function runCaseStudies({ limit = 10 } = {}) {
  const stats = { candidates: 0, drafted: 0, requested: 0 };

  // Need both a model key and a data layer; degrade to a clean no-op otherwise.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Case-study: ANTHROPIC_API_KEY missing, skipping.');
    try { await db.logRun({ kind: 'case-study', skipped: 'no_api_key', ...stats }); } catch {}
    return stats;
  }

  // Pull recent clients; filter to wins-without-a-case-study in JS.
  let clients = [];
  try {
    clients = await db.list('clients', { order: 'created_at', ascending: false, limit: 500 });
  } catch (e) {
    console.error('case-study: list clients failed:', e.message);
    try { await db.logRun({ kind: 'case-study', error: e.message, ...stats }); } catch {}
    return stats;
  }

  // Which clients already have a case study (any status)?
  let existing = [];
  try { existing = await db.list('case_studies', { limit: 1000 }); } catch { existing = []; }
  const haveStudy = new Set(existing.map(cs => String(cs.client_id)).filter(Boolean));

  const picks = [];
  for (const client of clients) {
    if (haveStudy.has(String(client.id))) continue;
    if (!hasWin(client)) continue;
    picks.push(client);
    if (picks.length >= limit) break;
  }
  stats.candidates = picks.length;
  if (!picks.length) {
    console.log('Case-study: no new wins to turn into proof yet.');
    try { await db.logRun({ kind: 'case-study', ...stats }); } catch {}
    return stats;
  }

  for (const client of picks) {
    const company = client.company || client.company_name || 'client';
    let contact = null;
    try { contact = client.contact_id ? await db.getById('contacts', client.contact_id) : null; } catch { contact = null; }

    let draft = null;
    try { draft = await draftFor(client, contact); }
    catch (e) { console.warn('case-study draft', company, e.message); continue; }
    if (!draft) { console.warn('case-study draft empty for', company); continue; }

    // Store the draft first so a send failure never loses the work.
    let row = null;
    try {
      row = await db.insert('case_studies', {
        client_id: client.id || null,
        company,
        draft: draft.case_study,
        email_subject: draft.email_subject,
        email_body: draft.email_body,
        status: 'draft',
        created_at: new Date().toISOString(),
      });
      stats.drafted++;
    } catch (e) { console.warn('case-study insert', company, e.message); continue; }

    // Email the testimonial + referral request to the client.
    const to = (contact && contact.email) || client.email || null;
    const toName = (contact && contact.first_name) || null;
    if (!to) { console.log('case-study: no email for', company, '— left as draft.'); continue; }
    try {
      await sendEmail({
        to,
        toName,
        subject: draft.email_subject,
        body: draft.email_body,
        cc: process.env.OUTREACH_CC || undefined,
      });
      if (row && row.id) {
        await db.update('case_studies', row.id, { status: 'requested', requested_at: new Date().toISOString() });
      }
      stats.requested++;
    } catch (e) { console.warn('case-study send', company, e.message); }
  }

  try { await db.logRun({ kind: 'case-study', ...stats }); } catch {}

  // Internal summary so the flywheel is visible.
  try {
    const body = [
      `Case-study run`,
      ``,
      `Candidates (new wins):   ${stats.candidates}`,
      `Case studies drafted:    ${stats.drafted}`,
      `Testimonial requests:    ${stats.requested}`,
      ``,
      `Review drafts and publish: https://admin.tmitechai.com/admin-case-studies`,
    ].join('\n');
    await sendDigest({ subject: `Case-study — ${stats.drafted} drafted, ${stats.requested} requested`, body });
  } catch (e) { console.error('case-study digest:', e.message); }

  console.log(`Case-study: ${stats.drafted} drafted, ${stats.requested} requested (${stats.candidates} candidates)`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '10', 10);
  runCaseStudies({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error('Fatal:', e); process.exit(1); });
}

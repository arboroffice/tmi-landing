// TMI Intent Agent — runs alongside the SDR agent.
//
// Watches job postings and LinkedIn/social chatter, asks Claude to judge whether
// each item is a real buying or hiring signal for an ICP-fit company, writes the
// qualified ones to the `signals` collection, and routes the strongest into the
// existing SDR pipeline (a 'new' lead the orchestrator audits + contacts, or a
// LinkedIn connect+DM touch). Weaker ones wait in /admin-signals for a human.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { findContact, getEmail, enrichCompany } from './tools/apollo.js';
import { extractDomain } from './tools/apify.js';
import { linkedinEnabled, pushToLinkedIn } from './tools/linkedin.js';
import { sendDigest } from './tools/email.js';
import { TMI_CONTEXT, JOB_QUERIES, SOCIAL_QUERIES, SUBREDDITS, THRESHOLDS, INTENT_LIMITS } from './intent-config.js';
import { fetchJobSignals, fetchLinkedInSignals, fetchRedditSignals } from './intent-sources.js';

const anthropic = new Anthropic();
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

const SYSTEM = `You are the intent analyst on TMI's go-to-market team. ${TMI_CONTEXT}

You read raw items pulled from job boards and social/LinkedIn and decide, for each, whether it is a genuine buying or hiring signal that TMI should act on. Be strict: a vague mention of "AI" is not a signal. A real signal is a specific operator or ICP-fit company either hiring for a coordination/dispatch/admin/ops role a digital employee replaces (signal_type "hiring_intent"), or publicly shopping for, evaluating, or frustrated with AI/automation/operations software for an ICP-fit business (signal_type "buying_intent"). A job seeker, a vendor selling tools, a student, or an enterprise far outside the ICP is not a signal.

For EACH input item return one object. Output ONLY a valid JSON array, no prose, no code fences, exactly one object per input item in the same order:
[{
  "is_signal": true|false,
  "signal_type": "hiring_intent" | "buying_intent" | "none",
  "icp_fit": 0-100,            // how well the company/person fits TMI's ICP
  "intent": 0-100,             // strength of the buying/hiring intent
  "confidence": 0-100,         // your confidence this read is correct
  "company": "best guess of the company name or null",
  "person_name": "name or null",
  "person_title": "title/headline or null",
  "summary": "one sentence on what they are doing",
  "rationale": "one or two sentences: why this is or is not a signal for TMI, quoting the item",
  "recommended_action": "the single best next move (e.g. 'enrich + send audit', 'LinkedIn connect + DM', 'reply with helpful comment', 'ignore')",
  "suggested_opener": "one sharp first-line opener TMI could send, in TMI voice, no hype, no em dashes"
}]
Never use em dashes. Keep every field specific to the item.`;

async function classifyBatch(items) {
  const payload = items.map((it, i) => ({
    i, source: it.source, type_hint: it.typeHint,
    company: it.company, person: it.person, location: it.location, text: it.text,
  }));
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Classify these ${items.length} items. Return the JSON array.\n\n${JSON.stringify(payload, null, 1)}` }],
  });
  let t = (msg.content?.[0]?.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a !== -1 && b !== -1) t = t.slice(a, b + 1);
  const arr = JSON.parse(t);
  return Array.isArray(arr) ? arr : [];
}

// Route a qualified signal into the SDR pipeline. Returns { routed, channel, leadId }.
async function route(cand, verdict, priorCount = 0) {
  const combined = Math.round((verdict.icp_fit + verdict.intent + verdict.confidence) / 3);
  // Multiple signals for the same company lower the routing bar: several weak
  // signals add up to strong account-level intent.
  const bar = Math.max(50, THRESHOLDS.autoRoute - Math.min(priorCount * 10, 20));
  if (combined < bar) return { routed: false };

  // Company-resolvable: enrich via Apollo and hand to the outbound loop as a new lead.
  const companyName = verdict.company || cand.company;
  if (companyName) {
    const domain = extractDomain('https://' + companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com');
    try {
      const [contact, org] = await Promise.all([
        findContact({ domain, targetTitles: ['Owner', 'CEO', 'President', 'Founder', 'General Manager', 'Operations Manager'] }).catch(() => null),
        enrichCompany({ domain }).catch(() => null),
      ]);
      if (contact && !contact.email && contact.apolloId) contact.email = await getEmail({ apolloId: contact.apolloId }).catch(() => null);
      if (contact?.email && !(await db.leadExists(contact.email))) {
        const lead = await db.insertLead({
          company_name: org?.name || companyName,
          website: org?.website || `https://${domain}`,
          industry: org?.industry || null,
          location: org?.location || cand.location || null,
          employee_count: org?.employeeCount?.toString() || null,
          owner_name: contact.name || null,
          owner_title: contact.title || null,
          email: contact.email,
          linkedin_url: contact.linkedinUrl || cand.person?.profileUrl || null,
          source: 'intent_signal',
          status: 'new',
          score: 'hot',
          research_notes: `Intent signal (${verdict.signal_type}, ${combined}/100): ${verdict.rationale}`,
          pain_points: verdict.summary || null,
        }).catch(() => null);
        if (lead) return { routed: true, channel: 'sdr_email', leadId: lead.id };
      }
    } catch (e) { console.warn('route enrich:', e.message); }
  }

  // Person-only LinkedIn signal: fire a connect + DM touch if that channel is wired.
  if (cand.person?.profileUrl && linkedinEnabled()) {
    try {
      await pushToLinkedIn({
        profileUrl: cand.person.profileUrl, name: cand.person.name,
        opener: verdict.suggested_opener, source: cand.source, signal: verdict.signal_type,
      });
      return { routed: true, channel: 'linkedin' };
    } catch (e) { console.warn('route linkedin:', e.message); }
  }
  return { routed: false };
}

export async function runIntentAgent() {
  const stats = { pulled: 0, classified: 0, signals: 0, routed: 0, bySource: {} };
  if (!process.env.ANTHROPIC_API_KEY) { console.warn('intent-agent: no ANTHROPIC_API_KEY, skipping'); return stats; }

  // 1) Gather candidates from the sources that are configured.
  const [jobs, li, reddit] = await Promise.all([
    fetchJobSignals(shuffle(JOB_QUERIES).slice(0, INTENT_LIMITS.jobQueriesPerRun), INTENT_LIMITS.jobsPerQuery),
    fetchLinkedInSignals(shuffle(SOCIAL_QUERIES).slice(0, INTENT_LIMITS.socialQueriesPerRun), INTENT_LIMITS.socialPerQuery),
    fetchRedditSignals(shuffle(SUBREDDITS).slice(0, INTENT_LIMITS.subredditsPerRun), INTENT_LIMITS.redditPerSub),
  ]);
  let candidates = [...jobs, ...li, ...reddit];
  stats.pulled = candidates.length;
  for (const c of candidates) stats.bySource[c.source] = (stats.bySource[c.source] || 0) + 1;

  // 2) Drop ones we've already seen.
  const fresh = [];
  for (const c of candidates) {
    if (!c.sourceId) continue;
    const seen = await db.findOne('signals', 'source_id', c.sourceId).catch(() => null);
    if (!seen) fresh.push(c);
  }
  candidates = shuffle(fresh).slice(0, INTENT_LIMITS.maxClassifyPerRun);
  if (!candidates.length) { console.log('intent-agent: no fresh candidates'); return stats; }

  // 3) Classify in batches of 8.
  const routed = [];
  for (let i = 0; i < candidates.length; i += 8) {
    const batch = candidates.slice(i, i + 8);
    let verdicts = [];
    try { verdicts = await classifyBatch(batch); } catch (e) { console.warn('classify batch:', e.message); continue; }
    for (let k = 0; k < batch.length; k++) {
      const cand = batch[k], v = verdicts[k];
      stats.classified++;
      if (!v || !v.is_signal) continue;
      if (v.icp_fit < THRESHOLDS.icpFit || v.intent < THRESHOLDS.intent || v.confidence < THRESHOLDS.confidence) continue;

      const company = v.company || cand.company || null;
      const priorCount = company ? await db.count('signals', [['company', '==', company]]).catch(() => 0) : 0;
      const r = await route(cand, v, priorCount).catch(() => ({ routed: false }));
      const sig = await db.insert('signals', {
        source: cand.source,
        source_id: cand.sourceId,
        url: cand.url || null,
        signal_type: v.signal_type || 'none',
        company,
        company_signal_count: priorCount + 1,
        person_name: v.person_name || cand.person?.name || null,
        person_title: v.person_title || cand.person?.title || null,
        person_url: cand.person?.profileUrl || null,
        location: cand.location || null,
        icp_fit: v.icp_fit, intent: v.intent, confidence: v.confidence,
        score: Math.round((v.icp_fit + v.intent + v.confidence) / 3),
        summary: v.summary || null,
        rationale: v.rationale || null,
        recommended_action: v.recommended_action || null,
        suggested_opener: v.suggested_opener || null,
        excerpt: cand.text?.slice(0, 400) || null,
        status: r.routed ? 'routed' : 'new',
        routed_channel: r.channel || null,
        routed_lead_id: r.leadId || null,
        created_at: new Date().toISOString(),
      }).catch(() => null);
      if (sig) {
        stats.signals++;
        if (r.routed) { stats.routed++; routed.push({ ...v, channel: r.channel }); }
      }
    }
  }

  if (stats.signals > 0) {
    await sendDigest({
      subject: `Intent agent: ${stats.signals} signals (${stats.routed} routed)`,
      body: [
        `TMI Intent Agent - ${new Date().toLocaleDateString()}`, '',
        `Pulled: ${stats.pulled} (${Object.entries(stats.bySource).map(([k, n]) => `${k} ${n}`).join(', ')})`,
        `Classified: ${stats.classified}`,
        `Qualified signals: ${stats.signals}`,
        `Auto-routed into the SDR pipeline: ${stats.routed}`, '',
        'Top routed:',
        ...routed.slice(0, 10).map(v => `  - [${v.signal_type}/${v.channel}] ${v.company || v.person_name || '?'}: ${v.summary}`),
        '', 'Review the rest in /admin-signals.',
      ].join('\n'),
    }).catch(e => console.error('intent digest:', e.message));
  }

  await db.insert('intent_runs', {
    ...stats, by_source: JSON.stringify(stats.bySource || {}), created_at: new Date().toISOString(),
  }).catch(() => {});

  console.log('intent-agent complete:', stats);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) runIntentAgent().catch(err => { console.error('Fatal:', err); process.exit(1); });

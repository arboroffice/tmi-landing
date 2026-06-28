// Lead-routing agent — the brain of the sales cockpit.
//
// Scores every active lead on fit + intent + engagement + recency (0-100), assigns
// a priority and the single next best action, and stamps it on the lead so the Sales
// Cockpit can rank the day and the operator (or another agent) knows what to do next.
// Pure scoring, no sends. Safe to run often.
//
//   import { routeLeads } from './lead-router.js';
//   await routeLeads({ limit: 500 });
//
// CLI:  node agents/gtm/lead-router.js

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';

const DONE = new Set(['won', 'client', 'building', 'closed', 'lost', 'unsubscribed', 'do_not_contact', 'rejected', 'dead']);
const daysAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : 9999;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

// High-intent sources score higher at the top of funnel.
const SOURCE_INTENT = {
  site_visitor: 34, intent_signal: 32, 'member_signup': 22, lookalike: 16,
  'intelligent-company-audit': 30, reactivation: 14,
};
function sourceScore(s) {
  if (!s) return 8;
  if (s.startsWith('tool:')) return 26;
  if (s.startsWith('download:')) return 20;
  return SOURCE_INTENT[s] ?? 10;
}

function score(lead) {
  let s = 0;
  // fit (size/industry known = more qualified)
  if (lead.company_name) s += 8;
  if (lead.employee_count || lead.revenue || lead.revenue_est) s += 10;
  if (lead.industry) s += 4;
  // intent (source + explicit hot/warm)
  s += sourceScore(lead.source);
  const sc = String(lead.score || '').toLowerCase();
  if (sc === 'hot') s += 16; else if (sc === 'warm') s += 8;
  // engagement
  if (lead.status === 'replied') s += 22;
  if (lead.audit_url) s += 8;
  if (lead.phone) s += 4;
  if ((lead.outreach_count || 0) > 0) s += 4;
  // recency (newer = hotter)
  const age = Math.min(daysAgo(lead.updated_at || lead.created_at), daysAgo(lead.created_at));
  if (age <= 2) s += 14; else if (age <= 7) s += 8; else if (age <= 21) s += 3; else s -= 6;
  return clamp(s);
}

// The single next best action for this lead, given where it is.
function nextAction(lead) {
  const st = String(lead.status || '').toLowerCase();
  if (st === 'replied') return { action: 'Book the call', kind: 'book' };
  if (st === 'booked') return { action: 'Prep for the call', kind: 'prep' };
  if (lead.phone && String(lead.score).toLowerCase() === 'hot') return { action: 'Call now', kind: 'call' };
  if (!lead.audit_url) return { action: 'Build + send audit', kind: 'audit' };
  if (['sent', 'in_campaign', 'contacted'].includes(st)) {
    const since = daysAgo(lead.contacted_at || lead.updated_at || lead.created_at);
    if (since >= 3) return { action: 'Follow up', kind: 'followup' };
    return { action: 'In sequence, wait', kind: 'wait' };
  }
  if (st === 'new' || st === 'audited') return { action: 'Send first touch', kind: 'send' };
  return { action: 'Review', kind: 'review' };
}

function stalled(lead) {
  const st = String(lead.status || '').toLowerCase();
  const since = daysAgo(lead.updated_at || lead.contacted_at || lead.created_at);
  return ['sent', 'in_campaign', 'contacted', 'audited'].includes(st) && since >= 14;
}

export async function routeLeads({ limit = 600 } = {}) {
  const stats = { scanned: 0, scored: 0, hot: 0, stalled: 0 };
  let pool = [];
  try {
    pool = await db.db().collection('leads').where('unsubscribed', '==', false).limit(limit).get()
      .then(s => s.docs.map(d => Object.assign({ id: d.id }, d.data())));
  } catch (e) {
    // fall back to the helper if the raw query path differs
    try { pool = await db.getNewLeads(limit); } catch { console.error('lead-router list:', e.message); return stats; }
  }
  for (const lead of pool) {
    stats.scanned++;
    if (DONE.has(String(lead.status || '').toLowerCase())) continue;
    const lead_score = score(lead);
    const na = nextAction(lead);
    const isStalled = stalled(lead);
    const priority = lead_score >= 70 ? 'hot' : lead_score >= 45 ? 'warm' : 'cold';
    if (priority === 'hot') stats.hot++;
    if (isStalled) stats.stalled++;
    try {
      await db.updateLead(lead.id, {
        lead_score, priority, next_action: na.action, next_action_kind: na.kind,
        stalled: isStalled, routed_at: new Date().toISOString(),
      });
      stats.scored++;
    } catch (e) { /* skip */ }
  }
  try { await db.logRun({ kind: 'lead-router', ...stats, at: new Date().toISOString() }); } catch {}
  console.log(`Lead-router: scored ${stats.scored} (${stats.hot} hot, ${stats.stalled} stalled) of ${stats.scanned}`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  routeLeads().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e); process.exit(1); });
}

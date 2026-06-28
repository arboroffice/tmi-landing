// CRM Reactivation Agent — the cheapest pipeline you have.
//
// Works the leads you already own: started-but-abandoned audits, contacted-no-reply,
// old inbound. It re-enters the most promising dormant records into the SDR pipeline
// (status 'new'), so the orchestrator re-audits and re-touches them with a fresh angle.
// Never touches converted leads, opt-outs, the suppression list, or anything reactivated
// recently, and caps how many times a single lead can be reactivated.
//
//   import { reactivateLeads } from './reactivate.js';
//   const stats = await reactivateLeads({ limit: 25, minAgeDays: 45 });
//
// CLI:  node agents/gtm/reactivate.js [limit]

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendDigest } from './tools/email.js';

// Statuses worth re-working (dormant, not converted, not actively in a sequence).
const REACTIVATABLE = new Set([
  'audit_started', 'audit_skipped', 'contacted', 'sent', 'no_reply', 'nurture', 'cold',
]);
// Never re-work these.
const TERMINAL = new Set([
  'booked', 'won', 'client', 'building', 'closed', 'lost', 'unsubscribed',
  'do_not_contact', 'rejected', 'in_campaign',
]);

const MAX_REACTIVATIONS = 2;       // lifetime cap per lead
const REACTIVATE_COOLDOWN_DAYS = 60;

const daysAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;

export async function reactivateLeads({ limit = 25, minAgeDays = 45 } = {}) {
  const stats = { scanned: 0, reactivated: 0, skipped: 0 };
  let pool = [];
  try {
    // Pull recent-ish leads that opted in / never opted out, newest first; filter in JS
    // because Firestore can't express "status in set AND not recently reactivated".
    pool = await db.list('leads', {
      where: [['unsubscribed', '==', false]],
      order: 'created_at', ascending: false, limit: 600,
    });
  } catch (e) {
    console.error('reactivate: list failed:', e.message);
    return stats;
  }

  const picks = [];
  for (const lead of pool) {
    stats.scanned++;
    if (!lead.email) { stats.skipped++; continue; }
    const status = String(lead.status || '').toLowerCase();
    if (TERMINAL.has(status)) { stats.skipped++; continue; }
    if (!REACTIVATABLE.has(status)) { stats.skipped++; continue; }
    if ((lead.reactivation_count || 0) >= MAX_REACTIVATIONS) { stats.skipped++; continue; }
    if (daysAgo(lead.reactivated_at) < REACTIVATE_COOLDOWN_DAYS) { stats.skipped++; continue; }
    // must be genuinely dormant
    const last = lead.updated_at || lead.contacted_at || lead.created_at;
    if (daysAgo(last) < minAgeDays) { stats.skipped++; continue; }
    picks.push(lead);
    if (picks.length >= limit) break;
  }

  for (const lead of picks) {
    try {
      if (await db.isSuppressed(lead.email)) { stats.skipped++; continue; }
      await db.updateLead(lead.id, {
        status: 'new',
        score: lead.score || 'warm',
        reactivated_at: new Date().toISOString(),
        reactivation_count: (lead.reactivation_count || 0) + 1,
        // clear any audit-completion / followup markers so the pipeline re-touches cleanly
        next_followup_at: null,
        research_notes: `${lead.research_notes || ''}\n[reactivated ${new Date().toISOString().slice(0, 10)} from status "${lead.status}"]`.trim(),
      });
      stats.reactivated++;
    } catch (e) { console.warn('reactivate lead', lead.id, e.message); stats.skipped++; }
  }

  console.log(`Reactivation: ${stats.reactivated} re-queued, ${stats.skipped} skipped (${stats.scanned} scanned)`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '25', 10);
  reactivateLeads({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error('Fatal:', e); process.exit(1); });
}

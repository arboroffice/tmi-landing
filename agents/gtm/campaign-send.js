// Daily cold-outbound sender for the Intelligent Company Shift campaign.
// Pulls fresh leads, runs each through the gate (verify + fit), and adds up to
// the daily cap into the Instantly campaign with industry-specific merge fields.
// Caps new first-touches at 50/day so cold volume stays healthy.
//
// CLI:  node agents/gtm/campaign-send.js [limit]

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { verifyAndQualify } from './campaign-verify.js';
import { addLeadToInstantly, instantlyEnabled } from './tools/instantly.js';
import CAMPAIGN from './campaign.js';

const DAILY_CAP = (CAMPAIGN.sending && CAMPAIGN.sending.dailyCap) || 50;

export async function runCampaignSend({ limit = DAILY_CAP } = {}) {
  const stats = { scanned: 0, queued: 0, invalid: 0, role: 0, suppressed: 0, errors: 0 };
  if (!instantlyEnabled()) { console.log('campaign-send: Instantly not configured, skipping.'); return stats; }

  let pool = [];
  try {
    pool = await db.list('leads', {
      where: [['status', '==', 'new'], ['unsubscribed', '==', false]],
      order: 'created_at', ascending: true, limit: Math.max(120, limit * 4),
    });
  } catch (e) { console.error('campaign-send: list failed:', e.message); return stats; }

  for (const lead of pool) {
    if (stats.queued >= limit) break;
    stats.scanned++;
    if (!lead.email) continue;

    const q = await verifyAndQualify(lead).catch(() => ({ ok: false, reason: 'error' }));
    if (!q.ok) {
      if (q.reason === 'invalid_email') stats.invalid++;
      else if (q.reason === 'role_account') stats.role++;
      else if (q.reason === 'suppressed') stats.suppressed++;
      else stats.errors++;
      // Park non-deliverables so we don't re-scan them tomorrow.
      if (q.reason === 'invalid_email' || q.reason === 'role_account') {
        await db.updateLead(lead.id, { status: 'unqualified', unqualified_reason: q.reason }).catch(() => {});
      }
      continue;
    }

    try {
      const [firstName, ...rest] = String(lead.owner_name || '').split(' ');
      await addLeadToInstantly({
        email: lead.email,
        firstName: firstName || undefined,
        lastName: rest.join(' ') || undefined,
        companyName: lead.company_name || undefined,
        variables: {
          industry: q.industryLabel,
          industry_angle: q.angle,
          city: lead.location || '',
        },
      });
      await db.updateLead(lead.id, {
        status: 'in_campaign', campaign: CAMPAIGN.name, industry_bucket: q.industry,
        contacted_at: new Date().toISOString(),
      });
      stats.queued++;
    } catch (e) { stats.errors++; console.warn('campaign-send add', lead.email, e.message); }
  }

  console.log(`campaign-send: queued ${stats.queued}/${limit} (scanned ${stats.scanned}, ${stats.invalid} invalid, ${stats.role} role, ${stats.suppressed} suppressed)`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runCampaignSend({ limit: parseInt(process.argv[2] || String(DAILY_CAP), 10) })
    .then((s) => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch((e) => { console.error('Fatal:', e); process.exit(1); });
}

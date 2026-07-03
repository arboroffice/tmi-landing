// The gate agent. Before any lead enters the cold campaign it must pass here:
//   1. valid, deliverable email (verifier / MX)   -> protects domain reputation
//   2. not a role account (info@, sales@, ...)      -> real person, better replies
//   3. not suppressed / opted out
// It also picks the industry-specific angle the email will use.
//
//   import { verifyAndQualify } from './campaign-verify.js';
//   const q = await verifyAndQualify(lead);  // { ok, reason, industry, angle, ... }

import * as db from './tools/db.js';
import { verifyEmail } from './tools/verify.js';
import { angleFor } from './industry-angles.js';

export async function verifyAndQualify(lead = {}) {
  const email = String(lead.email || '').toLowerCase().trim();
  if (!email.includes('@')) return { ok: false, reason: 'invalid_email' };

  // Opt-outs / suppression list.
  if (await db.isSuppressed(email).catch(() => false)) return { ok: false, reason: 'suppressed' };

  // Deliverability. If the verifier is unavailable it returns ok:true, so we
  // never hard-block on an outage, only on a definitive failure.
  const v = await verifyEmail(email).catch(() => ({ ok: true, role: false }));
  if (v.ok === false) return { ok: false, reason: 'invalid_email', status: v.status };
  if (v.role) return { ok: false, reason: 'role_account' };

  // Industry-specific angle (never rejects; the list is ICP-targeted upstream).
  const a = angleFor(lead.industry || lead.company_name || '');
  return { ok: true, industry: a.key, industryLabel: a.label, angle: a.angle, verified: v.ok !== false };
}

export async function qualifyLeads(leads = []) {
  const out = [];
  for (const l of leads) out.push({ lead: l, ...(await verifyAndQualify(l)) });
  return out;
}

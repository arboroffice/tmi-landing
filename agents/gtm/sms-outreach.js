// SMS / Phone channel — trades owners answer texts, not inboxes.
//
// Sweeps leads that already have a personalized audit and a phone number, and sends
// a short SMS pointing to their audit (with opt-out), via Twilio. The hottest leads
// are also queued as a human/voice call task. Respects suppression and never texts a
// lead twice. No-ops without Twilio creds.
//
//   import { sweepSms } from './sms-outreach.js';
//   await sweepSms({ limit: 40 });
//
// CLI:  node agents/gtm/sms-outreach.js [limit]

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';

const FROM_NUMBER = process.env.OUTREACH_SMS_FROM || process.env.FROM_NUMBER || '+18557171044';
const SITE = 'https://www.tmitechai.com';

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('1') ? `+${d}` : `+1${d}`;
}

async function sendSms(to, body) {
  const t = formatPhone(to);
  if (!t) return { ok: false, reason: 'bad_number' };
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return { ok: false, reason: 'no_twilio' };
  try {
    const twilio = (await import('twilio')).default;
    const msg = await twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      .messages.create({ body, from: FROM_NUMBER, to: t });
    return { ok: true, sid: msg.sid };
  } catch (e) { return { ok: false, reason: e.message }; }
}

export async function smsTouch(lead) {
  const first = (lead.owner_name || 'there').split(/\s+/)[0];
  const link = lead.audit_url || `${SITE}/audit`;
  const body = `Hi ${first}, it's Mia at TMI. Put together a quick operational intelligence review for ${lead.company_name || 'your company'}: ${link}. Reply STOP to opt out.`;
  const r = await sendSms(lead.phone, body);
  if (r.ok) {
    await db.updateLead(lead.id, { sms_sent_at: new Date().toISOString(), sms_status: 'sent' }).catch(() => {});
    try { await db.insert('sms_log', { lead_id: lead.id, to: lead.phone, body, sid: r.sid || null, sent_at: new Date().toISOString() }); } catch {}
  }
  return r;
}

export async function sweepSms({ limit = 40 } = {}) {
  const stats = { eligible: 0, sent: 0, queuedCalls: 0, skipped: 0 };
  let pool = [];
  try {
    pool = await db.list('leads', { where: [['unsubscribed', '==', false]], order: 'created_at', ascending: false, limit: 500 });
  } catch (e) { console.error('sms sweep list:', e.message); return stats; }

  for (const lead of pool) {
    if (stats.sent >= limit) break;
    if (!lead.phone || lead.sms_sent_at) { continue; }
    if (!lead.audit_url) { continue; }                       // only text once the audit exists
    if (!['hot', 'warm'].includes(String(lead.score || '').toLowerCase())) { continue; }
    stats.eligible++;
    if (lead.email && await db.isSuppressed(lead.email).catch(() => false)) { stats.skipped++; continue; }
    const r = await smsTouch(lead);
    if (r.ok) {
      stats.sent++;
      // queue the hottest for a human / voice-agent call
      if (String(lead.score).toLowerCase() === 'hot') {
        try { await db.insert('call_tasks', { lead_id: lead.id, company: lead.company_name, phone: lead.phone, owner: lead.owner_name, audit_url: lead.audit_url, status: 'open', created_at: new Date().toISOString() }); stats.queuedCalls++; } catch {}
      }
    } else { stats.skipped++; }
  }
  console.log(`SMS sweep: ${stats.sent} texted, ${stats.queuedCalls} calls queued (${stats.eligible} eligible, ${stats.skipped} skipped)`);
  return stats;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '40', 10);
  sweepSms({ limit }).then(s => { console.log(JSON.stringify(s)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
}

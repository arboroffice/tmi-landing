// AR / Collections Agent — TMI eats its own dogfood on overdue invoices.
//
// Finds overdue invoices (status not paid/void, due_date in the past), buckets
// them by days overdue (1-30, 31-60, 61-90, 90+), and emails the client's
// billing contact a reminder sized to the bucket: gentle early, firmer at 60+,
// escalation note at 90+. Idempotent — it will not re-send the same bucket
// reminder for the same invoice within 7 days (tracked in `collection_log`).
// Every path is guarded; on any failure it returns stats and never throws.
//
//   import { runCollections } from './collections.js';
//   const stats = await runCollections({ limit: 50 });
//
// CLI:  node agents/gtm/collections.js [limit]

import { fileURLToPath } from 'url';
import path from 'path';
import * as db from './tools/db.js';
import { sendEmail, sendDigest } from './tools/email.js';

// LLM is optional. If the SDK or key is unavailable, we use a clean template.
let anthropic = null;
try {
  const mod = await import('@anthropic-ai/sdk');
  const Anthropic = mod.default || mod.Anthropic;
  if (Anthropic && process.env.ANTHROPIC_API_KEY) anthropic = new Anthropic();
} catch { anthropic = null; }

const PAID_OR_VOID = new Set(['paid', 'void', 'voided', 'cancelled', 'canceled', 'refunded', 'written_off']);
const REMINDER_COOLDOWN_DAYS = 7;
const COMPANY = process.env.AR_COMPANY_NAME || 'TMI Technology';

const dayMs = 86400000;
const nowIso = () => new Date().toISOString();
const daysAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / dayMs : 0;

function bucketFor(daysOverdue) {
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

function money(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Pull a usable amount off the invoice (fields vary: amount or total).
function invoiceAmount(inv) {
  const v = inv.amount ?? inv.total ?? inv.amount_due ?? inv.balance ?? 0;
  return Number(v) || 0;
}

// Tone notes per bucket — feeds both the template and the LLM prompt.
const TONE = {
  '1-30': 'Friendly first reminder. Assume it simply slipped through. Polite, brief, easy.',
  '31-60': 'Firm but professional. The invoice is now meaningfully past due and needs attention.',
  '61-90': 'Direct. Ask for payment or a clear timeline. Note this account needs to be brought current.',
  '90+': 'Escalation. State the account is seriously past due and that it will move to our collections process if not resolved. Firm, professional, never aggressive.',
};

function templateBody({ contactName, clientName, number, amount, dueDate, daysOverdue, bucket }) {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,';
  const ref = number ? `invoice ${number}` : 'your invoice';
  const due = dueDate ? new Date(dueDate).toISOString().slice(0, 10) : 'its due date';
  const amt = money(amount);
  let mid;
  if (bucket === '1-30') {
    mid = `This is a quick reminder that ${ref} for ${amt} was due on ${due} and shows as unpaid. It may have simply slipped through, so no worries if it is already on the way. If you can let us know when to expect payment, we would appreciate it.`;
  } else if (bucket === '31-60') {
    mid = `Our records show ${ref} for ${amt} is now ${daysOverdue} days past due (due ${due}). We would like to get this resolved. Please arrange payment, or reply with a date we can expect it.`;
  } else if (bucket === '61-90') {
    mid = `${ref.charAt(0).toUpperCase() + ref.slice(1)} for ${amt} is now ${daysOverdue} days past due (due ${due}) and needs to be brought current. Please send payment, or reply with a firm payment date so we can keep your account in good standing.`;
  } else {
    mid = `${ref.charAt(0).toUpperCase() + ref.slice(1)} for ${amt} is seriously past due at ${daysOverdue} days (due ${due}). We need this account brought current. If we do not hear from you with payment or a concrete plan, this balance will move into our formal collections process. We would much rather resolve it directly with you.`;
  }
  return `${greeting}\n\n${mid}\n\nIf you have already paid or there is a question about this invoice, just reply to this email and we will sort it out.\n\nThank you,\n${COMPANY} Accounts Receivable`;
}

async function composeBody(ctx) {
  if (!anthropic) return templateBody(ctx);
  try {
    const prompt = `You write accounts receivable reminder emails for ${COMPANY}. Write the body only (no subject, no signature block beyond a simple sign-off). Tone for this bucket: ${TONE[ctx.bucket]}\n\nFacts:\n- Recipient: ${ctx.contactName || 'the billing contact'}\n- Client: ${ctx.clientName || 'the client'}\n- Invoice: ${ctx.number || '(no number)'}\n- Amount due: ${money(ctx.amount)}\n- Due date: ${ctx.dueDate ? new Date(ctx.dueDate).toISOString().slice(0, 10) : 'unknown'}\n- Days overdue: ${ctx.daysOverdue}\n\nRules: No em dashes. No emojis. Short paragraphs. Always invite a reply if they have already paid or have a question. Sign off as "${COMPANY} Accounts Receivable". Firm and professional, never aggressive.`;
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (resp?.content || []).map(b => b.text || '').join('').trim();
    if (text) return text.replace(/—/g, '-');
    return templateBody(ctx);
  } catch (e) {
    console.warn('collections: LLM compose failed, using template:', e.message);
    return templateBody(ctx);
  }
}

function subjectFor(ctx) {
  const ref = ctx.number ? `Invoice ${ctx.number}` : 'Invoice';
  if (ctx.bucket === '1-30') return `${ref} reminder - ${money(ctx.amount)} due`;
  if (ctx.bucket === '31-60') return `${ref} past due - ${money(ctx.amount)}`;
  if (ctx.bucket === '61-90') return `${ref} ${ctx.daysOverdue} days past due - please bring current`;
  return `${ref} seriously past due - ${money(ctx.amount)} - action needed`;
}

// Resolve the billing email: invoice.contact_id -> contacts, else client -> contacts.
async function resolveBillingContact(inv) {
  let contact = null;
  try {
    if (inv.contact_id) contact = await db.getById('contacts', inv.contact_id);
  } catch { /* ignore */ }
  let clientName = null;
  try {
    if (inv.client_id) {
      const client = await db.getById('clients', inv.client_id);
      if (client) {
        clientName = client.name || client.company || client.company_name || null;
        if (!contact && client.contact_id) {
          contact = await db.getById('contacts', client.contact_id);
        }
      }
    }
  } catch { /* ignore */ }
  return { contact, clientName };
}

// Has this invoice+bucket already been reminded within the cooldown window?
async function recentlyReminded(invoiceId, bucket) {
  try {
    const rows = await db.list('collection_log', {
      where: [['invoice_id', '==', invoiceId]],
      order: 'sent_at', ascending: false, limit: 20,
    });
    return rows.some(r => r.bucket === bucket && daysAgo(r.sent_at) < REMINDER_COOLDOWN_DAYS);
  } catch (e) {
    // Fail safe: if we cannot read the log, assume already reminded so we never
    // risk double-sending a reminder to a client.
    console.warn('collections: collection_log read failed, skipping to be safe:', e.message);
    return true;
  }
}

export async function runCollections({ limit = 50 } = {}) {
  const cap = Math.max(1, Math.min(Number(limit) || 50, 200));
  const stats = {
    overdue: 0,
    remindersSent: 0,
    skipped: 0,
    outstandingTotal: 0,
    byBucket: { '1-30': { count: 0, outstanding: 0 }, '31-60': { count: 0, outstanding: 0 }, '61-90': { count: 0, outstanding: 0 }, '90+': { count: 0, outstanding: 0 } },
  };

  let invoices = [];
  try {
    invoices = await db.list('invoices', { order: 'created_at', ascending: false, limit: 1000 });
  } catch (e) {
    console.error('collections: invoice list failed:', e.message);
    return finalize(stats);
  }

  const now = Date.now();
  const overdue = [];
  for (const inv of invoices) {
    const status = String(inv.status || '').toLowerCase();
    if (PAID_OR_VOID.has(status)) continue;
    if (!inv.due_date) continue;
    const dueMs = new Date(inv.due_date).getTime();
    if (!Number.isFinite(dueMs) || dueMs >= now) continue;
    const daysOverdue = Math.floor((now - dueMs) / dayMs);
    if (daysOverdue < 1) continue;
    const amount = invoiceAmount(inv);
    const bucket = bucketFor(daysOverdue);
    overdue.push({ inv, daysOverdue, amount, bucket });
  }

  // Tally totals across all overdue (independent of send cap).
  for (const o of overdue) {
    stats.overdue++;
    stats.outstandingTotal += o.amount;
    stats.byBucket[o.bucket].count++;
    stats.byBucket[o.bucket].outstanding += o.amount;
  }

  // Send reminders, oldest-overdue first, up to the cap.
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  let processed = 0;
  for (const o of overdue) {
    if (processed >= cap) break;
    processed++;
    const { inv, daysOverdue, amount, bucket } = o;

    if (await recentlyReminded(inv.id, bucket)) { stats.skipped++; continue; }

    let to = inv.billing_email || inv.email || null;
    let contactName = inv.billing_name || null;
    let clientName = null;
    try {
      const { contact, clientName: cn } = await resolveBillingContact(inv);
      clientName = cn;
      if (contact) {
        to = to || contact.email;
        contactName = contactName || contact.name || contact.first_name || null;
      }
    } catch { /* ignore */ }

    if (!to || !String(to).includes('@')) { stats.skipped++; continue; }

    const ctx = {
      contactName, clientName,
      number: inv.number || inv.invoice_number || null,
      amount, dueDate: inv.due_date, daysOverdue, bucket,
    };

    let subject, body;
    try {
      subject = subjectFor(ctx);
      body = await composeBody(ctx);
    } catch (e) {
      console.warn('collections: compose failed for', inv.id, e.message);
      stats.skipped++; continue;
    }

    try {
      await sendEmail({ to, toName: contactName || undefined, subject, body, cc: process.env.OUTREACH_CC || undefined });
    } catch (e) {
      console.warn('collections: send failed for', inv.id, e.message);
      stats.skipped++; continue;
    }

    // Record the reminder (idempotency) and stamp the invoice.
    try {
      await db.insert('collection_log', {
        invoice_id: inv.id,
        client_id: inv.client_id || null,
        bucket,
        days_overdue: daysOverdue,
        amount,
        channel: 'email',
        sent_at: nowIso(),
      });
    } catch (e) { console.warn('collections: log insert failed for', inv.id, e.message); }
    try {
      await db.update('invoices', inv.id, { last_reminder_at: nowIso() });
    } catch (e) { console.warn('collections: invoice stamp failed for', inv.id, e.message); }

    stats.remindersSent++;
  }

  return finalize(stats);
}

async function finalize(stats) {
  // Observability + internal AR digest. Both are best-effort.
  try {
    await db.logRun({
      kind: 'collections',
      overdue: stats.overdue,
      remindersSent: stats.remindersSent,
      skipped: stats.skipped,
      outstandingTotal: Math.round(stats.outstandingTotal * 100) / 100,
    });
  } catch (e) { console.warn('collections: logRun failed:', e.message); }

  try {
    const b = stats.byBucket;
    const line = (label, key) => `  ${label}: ${b[key].count} invoices, ${money(b[key].outstanding)} outstanding`;
    const body = [
      `${COMPANY} accounts receivable summary for ${new Date().toISOString().slice(0, 10)}.`,
      '',
      `Overdue invoices: ${stats.overdue}`,
      `Total outstanding: ${money(stats.outstandingTotal)}`,
      `Reminders sent this run: ${stats.remindersSent}`,
      `Skipped (no contact, recently reminded, or send issue): ${stats.skipped}`,
      '',
      'By aging bucket:',
      line('Current (1-30 days)', '1-30'),
      line('31-60 days', '31-60'),
      line('61-90 days', '61-90'),
      line('90+ days', '90+'),
    ].join('\n');
    await sendDigest({ subject: `AR summary: ${money(stats.outstandingTotal)} outstanding, ${stats.remindersSent} reminders sent`, body });
  } catch (e) { console.warn('collections: digest failed:', e.message); }

  console.log(`Collections: ${stats.remindersSent} reminders sent, ${stats.overdue} overdue, ${money(stats.outstandingTotal)} outstanding (${stats.skipped} skipped)`);
  return {
    overdue: stats.overdue,
    remindersSent: stats.remindersSent,
    outstandingTotal: Math.round(stats.outstandingTotal * 100) / 100,
    skipped: stats.skipped,
    byBucket: stats.byBucket,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const limit = parseInt(process.argv[2] || '50', 10);
  runCollections({ limit })
    .then(s => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch(e => { console.error('Fatal:', e); process.exit(1); });
}

const db = require('./_db');
const { cors } = require('./_auth');
const { Client: QStashClient } = require('@upstash/qstash');

const SITE = 'https://www.tmitechai.com';

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, phone, company, intent } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email required' });

  // intent 'book' = they chose "skip the audit and book a call." We still create
  // the lead so booking-confirmed can match them by email, and the pre-call
  // sequence (api/followup) texts them to finish the 5-min audit before the call.
  const skippedToBook = intent === 'book';

  let leadId = null;
  try {
    const lead = await db.upsertByField('leads', 'email', email.toLowerCase().trim(), {
      name: name || null,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      status: skippedToBook ? 'audit_skipped' : 'audit_started',
      notes: JSON.stringify({
        company,
        audit_started_at: new Date().toISOString(),
        nudge_sent: false,
        ...(skippedToBook ? { booking_intent: true } : {}),
      }),
    });
    if (lead) leadId = lead.id;

    // Tag the contact for the audit funnel (no newsletter). We never touch
    // `unsubscribed`, so anyone who previously opted out stays opted out.
    try {
      const em = email.toLowerCase().trim();
      const ex = await db.findOne('contacts', 'email', em);
      const tags = Array.isArray(ex && ex.tags) ? ex.tags.slice() : [];
      if (!tags.includes('audit')) tags.push('audit');
      const first = (name || '').trim().split(' ')[0] || em.split('@')[0];
      const last = (name && name.trim().includes(' ')) ? name.trim().split(' ').slice(1).join(' ') : null;
      await db.upsertByField('contacts', 'email', em,
        { first_name: first, last_name: last, email: em, company: company || null, tags }
      );
    } catch (e) { console.error('audit-start contact tag:', e.message); }

    // Land them in the admin pipeline right away so the team sees started-but-
    // not-finished audits, and booking-confirmed can match them by email later.
    // (We do NOT create an audit_submissions row here - that is the signal the
    // abandon-chaser uses to know the audit is actually finished.)
    try {
      const em = email.toLowerCase().trim();
      const existing = await db.findOne('applications', 'email', em);
      if (!existing) {
        await db.insert('applications', {
          email: em, name: name || null, phone: phone || null, company: company || null,
          source: 'intelligent-company-audit', status: skippedToBook ? 'audit_skipped' : 'audit_started',
          started_at: new Date().toISOString(),
        });
      } else if (!['booked', 'audit_submitted', 'won', 'client', 'building', 'closed'].includes(existing.status)) {
        await db.update('applications', existing.id, { phone: phone || existing.phone, company: company || existing.company, started_at: new Date().toISOString() });
      }
    } catch (e) { console.error('audit-start application:', e.message); }
  } catch (e) {
    console.error('audit-start db:', e.message);
  }

  // Instant "you're in" touch, so the prospect has their resume link the moment
  // they enter their info - catches the early bail before the 10-minute nudge.
  try {
    const first = (name || '').trim().split(' ')[0] || 'there';
    const rp = new URLSearchParams({ n: name || '', e: email, p: phone || '', c: company || '' });
    const resumeLink = `${SITE}/audit?resume=1&${rp.toString()}`;
    if (process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'TMI <support@tmitechai.com>', to: email,
        subject: `${first}, your Business Intelligence Audit is saved`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 16px;">Hey ${first},</p>
<p style="margin:0 0 16px;">You started your Intelligent Company Audit. It is saved, so you can pick it back up any time and your answers will be waiting.</p>
<p style="margin:0 0 16px;">It takes about 15 minutes, and most of it we already did for you. At the end you get your operation scored, your biggest leaks named with the cost, and the first system to fix.</p>
<p style="margin:24px 0;"><a href="${resumeLink}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;display:inline-block;">Pick up where I left off</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Founder, TMI</span></p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
      });
    }
    if (phone && process.env.TWILIO_ACCOUNT_SID) {
      const d = String(phone).replace(/\D/g, ''); const to = d.startsWith('1') ? `+${d}` : `+1${d}`;
      await require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
        body: `Hey ${first}, it's Mia at TMI. Your Business Intelligence Audit is saved - pick it back up any time here: ${resumeLink} (about 15 min, most of it we already did for you).`,
        from: '+18557171044', to,
      });
    }
  } catch (e) { console.error('audit-start instant touch:', e.message); }

  // Schedule the abandon-chaser sequence via QStash. Each step no-ops once the
  // audit is completed, the lead converts/books, or unsubscribes (see audit-nudge.js).
  try {
    const qstash = new QStashClient({ token: process.env.QSTASH_TOKEN });
    const nudgeUrl = `${SITE}/api/audit-nudge?secret=${process.env.GTM_RUN_SECRET || ''}`;
    const schedule = [
      { delay: 600,    step: 'abandon_10min' }, // 10 min — finish the audit
      { delay: 86400,  step: 'abandon_day1' },  // 1 day  — text the booking link, still push the audit
      { delay: 259200, step: 'abandon_day3' },  // 3 days — final touch, both doors
    ];
    for (const { delay, step } of schedule) {
      qstash.publishJSON({ url: nudgeUrl, delay, body: { leadId, name, email, phone, company, step } })
        .catch(e => console.error(`QStash nudge ${step}:`, e.message));
    }
  } catch (e) {
    console.error('QStash schedule:', e.message);
  }

  return res.status(200).json({ ok: true, leadId });
};

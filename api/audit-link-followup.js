// Follow-up for a business that got a rep's audit payment link but has not paid.
// Scheduled by rep-leads.js (QStash) the first time a rep sends the link:
// day 1 and day 3. Each touch is an email (if we have one) and a text (if we
// have a phone), signed by the rep. Stops the moment the audit is paid, the
// lead is closed, or the touch was already sent.
//   POST ?secret=...  { leadId, step: 'day1' | 'day3' }
const db = require('./_db');

const PAY_URL = 'https://buy.stripe.com/9B600j7LQejf2pvdpYcV200';
const FROM_NUMBER = '+18557171044';
const CLOSED = ['won', 'lost', 'not_interested'];

const payLink = (l) => `${PAY_URL}?client_reference_id=${encodeURIComponent('rl_' + l.id)}${l.email ? '&prefilled_email=' + encodeURIComponent(l.email) : ''}`;
const first = (s) => String(s || '').trim().split(/\s+/)[0];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function copy(step, l, rep) {
  const name = first(l.contact_name) || 'there';
  const co = l.business_name || 'your company';
  const link = payLink(l);
  if (step === 'day1') return {
    subject: `Your Intelligent Company Audit with TMI Tech AI`,
    email: [`Hey ${name},`,
      `Following up on the Intelligent Company Audit for ${co}.`,
      `Quick reminder of what it is: 30 to 45 minutes, in person or by phone, looking at how the company sells, operates, communicates, tracks information and makes decisions. You get a Business Intelligence Score out of 100 across ten areas, a five-page report, and the Intelligent Company Roadmap, which is yours to keep whether or not you ever work with us.`,
      `Here is the link to get it started: ${link}`,
      `Any questions, just reply to this email.`,
      `${rep}\nTMI Tech AI`],
    sms: `Hey ${name}, it's ${rep} with TMI Tech AI. Following up on the Intelligent Company Audit for ${co}. Here's the link to get it started: ${link} Any questions, just reply. Reply STOP to opt out.`,
  };
  return {
    subject: `Still want us to look at ${co}?`,
    email: [`Hey ${name},`,
      `Last note from me on this.`,
      `Most owners we talk to already have plenty of software. The problem is none of it works together, and the cost hides in a hundred small manual steps nobody tracks. The audit finds those.`,
      `If now is the right time, here is the link: ${link}`,
      `If it is not, no problem. Just reply and tell me when to check back.`,
      `${rep}\nTMI Tech AI`],
    sms: `Hi ${name}, ${rep} with TMI Tech AI one more time. If you want us to find where ${co} is losing time and money, the audit link is here: ${link} If now's not the time, just reply "later".`,
  };
}

function html(paragraphs) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;">${esc(p).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#6f8f2a;font-weight:700;">Start the audit &rarr;</a>')}</p>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5ef;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#fff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;color:#fff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">${body}</td></tr></table></td></tr></table></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const want = process.env.GTM_RUN_SECRET || process.env.JWT_SECRET || '';
  if (!want || req.query.secret !== want) return res.status(401).json({ error: 'Unauthorized' });
  const { leadId, step } = req.body || {};
  if (!leadId || !['day1', 'day3'].includes(step)) return res.status(400).json({ error: 'leadId and step required' });

  try {
    // Claim the step so it goes out once, and skip anything already paid or closed.
    const fs = db.db();
    const ref = fs.collection('rep_leads').doc(leadId);
    const lead = await fs.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const l = snap.data();
      if (l.audit_paid_at || CLOSED.includes(l.status) || l.link_followup_stopped) return null;
      if ((l.link_followups || []).includes(step)) return null;
      tx.update(ref, { link_followups: (l.link_followups || []).concat(step) });
      return Object.assign({ id: snap.id }, l);
    });
    if (!lead) return res.json({ ok: true, skipped: true });

    const repDoc = await db.getById('reps', lead.rep_id).catch(() => null);
    const rep = first(repDoc && repDoc.name) || 'The TMI Tech AI team';
    const c = copy(step, lead, rep);
    const sent = [];
    if (lead.email && process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: `${rep} at TMI Tech AI <support@tmitechai.com>`, to: lead.email, reply_to: 'support@tmitechai.com',
        subject: c.subject, html: html(c.email),
      });
      sent.push('email');
    }
    const digits = String(lead.phone || '').replace(/\D/g, '');
    if (digits.length >= 10 && process.env.TWILIO_ACCOUNT_SID) {
      await require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
        body: c.sms, from: FROM_NUMBER, to: digits.length === 10 ? `+1${digits}` : `+${digits}`,
      });
      sent.push('sms');
    }
    // Put it on the lead's timeline and status so the rep sees TMI already did it.
    const now = new Date().toISOString();
    const label = step === 'day1' ? 'day 1' : 'day 3';
    const what = sent.length ? sent.map((x) => (x === 'sms' ? 'text' : 'email')).join(' + ') : null;
    await db.insert('rep_interactions', {
      rep_id: lead.rep_id, lead_id: leadId, channel: sent.includes('sms') ? 'text' : 'email', source: 'auto',
      summary: what
        ? `TMI sent the ${label} audit follow-up for you (${what}) with the payment link.`
        : `TMI could not send the ${label} follow-up: no email or phone on this lead. Add one so TMI can follow up.`,
      transcript: null, outcome: null, next_step: null, sentiment: null, created_at: now,
    }).catch((e) => console.error('log auto follow-up:', e.message));
    await db.update('rep_leads', leadId, {
      link_followups_log: (lead.link_followups_log || []).concat({ step, at: now, sent }),
    }).catch(() => {});
    return res.json({ ok: true, step, sent });
  } catch (e) {
    console.error('audit-link-followup:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

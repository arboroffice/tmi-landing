// The single funnel: capture the lead (name, business, website, email, phone),
// then hand back the Stripe Checkout URL for the $1,000 Complete Audit.
//
// The lead is stored BEFORE payment so non-payers enter the follow-up sequence
// and get nudged until they complete the audit. Nobody books a call until the
// audit is paid for (see booking.html gate).
//
// POST { name, company, website?, email, phone? } -> { url }

const db = require('./_db');

const SITE = 'https://www.tmitechai.com';
const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const PRICE_CENTS = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 100000); // $1,000

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const { name, company, website, email, phone } = req.body || {};
  if (!name || !email || email.indexOf('@') < 0) {
    return res.status(400).json({ error: 'Name and a valid email are required.' });
  }
  const firstName = String(name).trim().split(/\s+/)[0];
  const cleanEmail = String(email).trim().toLowerCase();

  // 1) Store / refresh the lead (captured, unpaid).
  let app = null;
  try {
    app = await db.upsertByField('applications', 'email', cleanEmail, {
      name,
      phone: phone || null,
      company: company || null,
      website: website || null,
      source: 'complete_audit',
      status: 'captured',
      captured_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('audit-capture store:', e.message);
    // Storing must not block the sale - keep going so they can still pay.
  }

  // 2) Create the $1,000 Checkout session.
  let url;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'TMI Complete Audit',
            description: 'Detailed operational audit, Intelligence Score, 30-day plan, and a 30-minute strategy call with the founder and a strategist.',
          },
          unit_amount: PRICE_CENTS,
        },
        quantity: 1,
      }],
      customer_email: cleanEmail,
      success_url: `${SITE}/complete-audit-intake?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/complete-audit`,
      metadata: { product: 'complete_audit', company: company || '', application_id: app ? app.id : '' },
    });
    url = session.url;
  } catch (e) {
    console.error('audit-capture checkout:', e.message);
    return res.status(500).json({ error: e.message });
  }

  // 3) Fire-and-forget: confirmation, internal alert, and the payment-nurture chain.
  //    None of this can block the redirect to checkout.
  (async () => {
    // Internal alert
    try {
      if (process.env.TWILIO_ACCOUNT_SID) {
        const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await sms.messages.create({
          body: `Complete Audit capture: ${name}\n${cleanEmail}\n${phone || 'no phone'}\nCo: ${company || (cleanEmail.split('@')[1] || '')}\n${website || ''}`,
          from: FROM_NUMBER, to: ALERT_NUMBER,
        });
      }
    } catch (e) { console.error('capture alert sms:', e.message); }

    // Confirmation email to the lead (in case they bail before paying).
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend');
        const unsub = app ? `${SITE}/api/unsubscribe?id=${app.id}` : `${SITE}`;
        const resumeUrl = app ? `${SITE}/api/audit-resume?id=${app.id}` : `${SITE}/complete-audit`;
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: 'TMI <support@tmitechai.com>',
          to: cleanEmail,
          subject: 'Your Complete Audit is one step away',
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f5ef;-webkit-font-smoothing:antialiased;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px 8px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.7;">
<p style="margin:0 0 16px;">Hey ${firstName},</p>
<p style="margin:0 0 16px;">You are one step from your Complete Audit. We map exactly how your business runs, where time and money leak, your Intelligence Score, and a 30-day plan to fix it. Then you sit down with the founder and a strategist for 30 minutes to walk through it and pick your path.</p>
<p style="margin:0 0 24px;"><a href="${resumeUrl}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;display:inline-block;">Complete your audit ($1,000)</a></p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">TMI</span></p>
<p style="margin:32px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsub}" style="color:#bbb;">Unsubscribe</a></p>
</td></tr><tr><td style="padding:6px 30px 28px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><div style="border-top:1px solid #eceee4;margin-top:8px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies<br><a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
        });
      }
    } catch (e) { console.error('capture email:', e.message); }

    // Payment-nurture chain (only fires while status stays 'captured').
    try {
      if (app && process.env.QSTASH_TOKEN) {
        const { Client } = require('@upstash/qstash');
        const qstash = new Client({ token: process.env.QSTASH_TOKEN });
        const followupUrl = `${SITE}/api/audit-followup?secret=${process.env.GTM_RUN_SECRET || ''}`;
        const schedule = [
          { delay: 3600,    step: 'hour1' },
          { delay: 86400,   step: 'day1' },
          { delay: 259200,  step: 'day3' },
          { delay: 604800,  step: 'day7' },
        ];
        for (const { delay, step } of schedule) {
          await qstash.publishJSON({ url: followupUrl, delay, body: { applicationId: app.id, step } });
        }
      }
    } catch (e) { console.error('capture nurture schedule:', e.message); }
  })();

  return res.json({ url });
};

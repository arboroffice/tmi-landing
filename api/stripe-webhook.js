// Stripe webhook: the source of truth for Complete Audit payments.
//
// checkout.session.completed (paid) -> mark the captured lead paid, stop the
// nurture chain, and alert the team. This fires even if the customer closes the
// tab before reaching the intake page, so a paying customer never keeps getting
// "finish your audit" nudges.
//
// charge.refunded / refund.created / charge.dispute.created -> mark refunded.
//
// Mounted with a raw body in server.js so the signature can be verified.
// Set STRIPE_WEBHOOK_SECRET to the endpoint's signing secret (whsec_...).

const dbx = require('./_db');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';

function alertTeam(text) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID) return;
    const sms = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    sms.messages.create({ body: text, from: FROM_NUMBER, to: ALERT_NUMBER }).catch(() => {});
  } catch (e) { /* best effort */ }
}

// Branded transactional email (best-effort, fire-and-forget - never blocks the webhook).
function sendEmail(to, subject, innerHtml) {
  try {
    if (!process.env.RESEND_API_KEY || !to) return;
    const { Resend } = require('resend');
    new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'TMI <support@tmitechai.com>', to, subject,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f5ef;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5ef;"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#fff;border:1px solid #e7e8e1;border-radius:16px;overflow:hidden;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"><tr><td style="background:#0a0b14;padding:18px 30px;"><span style="font-size:19px;font-weight:800;letter-spacing:-0.02em;color:#fff;">TMI</span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#E4FF97;margin-left:5px;"></span></td></tr><tr><td style="padding:34px 30px;color:#1a1a1a;font-size:16px;line-height:1.7;">${innerHtml}</td></tr><tr><td style="padding:0 30px 28px;"><div style="border-top:1px solid #eceee4;padding-top:16px;font-size:12px;color:#9a9ba5;">TMI Technology &middot; chaos control for growing companies &middot; <a href="https://www.tmitechai.com" style="color:#6f8f2a;text-decoration:none;">tmitechai.com</a></div></td></tr></table></td></tr></table></body></html>`,
    }).catch(e => console.error('stripe email:', e.message));
  } catch (e) { /* best effort */ }
}

async function findApp({ applicationId, email }) {
  if (applicationId) {
    const byId = await dbx.getById('applications', applicationId).catch(() => null);
    if (byId) return byId;
  }
  if (email) return dbx.findOne('applications', 'email', String(email).toLowerCase()).catch(() => null);
  return null;
}

async function markPaid(session) {
  const email = (session.customer_details && session.customer_details.email) || session.customer_email || null;
  const applicationId = (session.metadata && session.metadata.application_id) || null;
  const company = (session.metadata && session.metadata.company) || '';
  const app = await findApp({ applicationId, email });
  if (app) {
    if (app.status === 'paid' || app.status === 'booked') return; // idempotent
    await dbx.update('applications', app.id, {
      status: 'paid', paid_at: new Date().toISOString(), stripe_session: session.id,
    });
    alertTeam(`PAID Complete Audit: ${app.name || company || email} | ${email || 'no email'}`);
    // Immediate payment confirmation + next step to the customer (in case they
    // closed the tab before the intake page loaded).
    if (email) {
      const cfn = (app.name || 'there').split(/\s+/)[0];
      const intake = `https://www.tmitechai.com/complete-audit-intake?session_id=${encodeURIComponent(session.id)}`;
      sendEmail(email, 'Payment received - your Complete Audit is underway', `
<p style="margin:0 0 16px;">Hey ${cfn},</p>
<p style="margin:0 0 16px;">Your Complete Audit payment came through - thank you. You're in.</p>
<p style="margin:0 0 16px;">The one thing we need from you now is a short intake so we build the audit around your actual operation. It takes about 10 to 15 minutes, and the more detail you give, the sharper it comes back.</p>
<p style="margin:0 0 24px;"><a href="${intake}" style="color:#5a9e00;font-weight:600;">Start your intake &rarr;</a></p>
<p style="margin:0 0 16px;">Once it's in, we build your written diagnosis and the plan, then you book a call to walk through it. Reply here anytime.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Founder, TMI</span></p>`);
    }
    // Nudge to complete the intake if they paid and bailed (stops once intake exists).
    try {
      if (process.env.QSTASH_TOKEN && email) {
        const { Client } = require('@upstash/qstash');
        const qs = new Client({ token: process.env.QSTASH_TOKEN });
        const nurl = `https://www.tmitechai.com/api/funnel-nurture?secret=${process.env.GTM_RUN_SECRET || ''}`;
        const base = { stage: 'paid_no_intake', email, session_id: session.id };
        await qs.publishJSON({ url: nurl, delay: 10800, body: base });            // +3h
        await qs.publishJSON({ url: nurl, delay: 86400, body: { ...base, touch: 'second' } }); // +24h
      }
    } catch (e) { console.error('schedule paid_no_intake:', e.message); }
  } else {
    // Paid but no captured lead on file (rare) - still log it so it is recoverable.
    await dbx.insert('applications', {
      email: email ? email.toLowerCase() : null, company: company || null,
      source: 'complete_audit', status: 'paid', paid_at: new Date().toISOString(), stripe_session: session.id,
    }).catch(() => {});
    alertTeam(`PAID Complete Audit (no prior capture): ${email || company || session.id}`);
  }
}

async function markBuildDeposit(session) {
  const proposalId = session.metadata && session.metadata.proposal_id;
  const path = (session.metadata && session.metadata.path) || '';
  if (!proposalId) return;
  const prop = await dbx.getById('proposals', proposalId).catch(() => null);
  if (!prop) return;
  if (prop.status === 'accepted') return; // idempotent
  await dbx.update('proposals', proposalId, {
    status: 'accepted', accepted_path: path, accepted_at: new Date().toISOString(),
    deposit_paid: (session.amount_total || 0) / 100, stripe_session: session.id,
  });
  alertTeam(`BUILD ACCEPTED (${path.toUpperCase()}): ${prop.company || prop.client_email || proposalId} - deposit $${((session.amount_total || 0) / 100).toLocaleString()}`);
  // Onboarding / welcome email to the client who just committed to the build.
  const clientEmail = prop.client_email || ((session.customer_details && session.customer_details.email) || null);
  if (clientEmail) {
    const cfn = (prop.client_name || prop.company || 'there').split(/\s+/)[0];
    sendEmail(clientEmail, 'You\'re in - let\'s build', `
<p style="margin:0 0 16px;">Hey ${cfn},</p>
<p style="margin:0 0 16px;">Your deposit came through and the build is a go. This is the fun part.</p>
<p style="margin:0 0 16px;">Here's what happens next: we lock your kickoff, map your operation in detail, and start installing. You'll have a single point of contact the whole way, and we build in about 30 days.</p>
<p style="margin:0 0 16px;">We'll reach out within one business day to schedule kickoff. If you want to get us anything ahead of time - logins, current tools, the one thing you most want fixed first - just reply here.</p>
<p style="margin:0;">Mia<br><span style="color:#888;font-size:13px;">Founder, TMI</span></p>`);
  }
}

async function markRefunded(event) {
  const obj = event.data.object || {};
  const email = obj.receipt_email || (obj.billing_details && obj.billing_details.email) || null;
  if (!email) return;
  const app = await dbx.findOne('applications', 'email', String(email).toLowerCase()).catch(() => null);
  if (app) {
    await dbx.update('applications', app.id, { status: 'refunded', refunded_at: new Date().toISOString() });
    alertTeam(`REFUND/dispute on Complete Audit: ${app.name || email}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];
  const raw = req.rawBody || req.body; // Buffer when mounted with express.raw

  let event;
  try {
    if (secret && sig && (Buffer.isBuffer(raw) || typeof raw === 'string')) {
      event = stripe.webhooks.constructEvent(raw, sig, secret);
    } else {
      // Fail closed: never trust an unsigned body in any environment.
      console.error('stripe webhook: signing secret or signature missing; rejecting');
      return res.status(400).send('Webhook signature required');
    }
  } catch (e) {
    console.error('stripe webhook verify:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      if (s.payment_status === 'paid') {
        if (s.metadata && s.metadata.product === 'build_deposit') await markBuildDeposit(s);
        else await markPaid(s);
      }
    } else if (event.type === 'checkout.session.expired') {
      // Someone opened the $1k checkout and didn't finish - flag it so the team
      // can follow up while it's warm.
      const s = event.data.object || {};
      if (!(s.metadata && s.metadata.product === 'build_deposit')) {
        const em = (s.customer_details && s.customer_details.email) || s.customer_email || null;
        const co = (s.metadata && s.metadata.company) || '';
        if (em || co) alertTeam(`Abandoned Complete Audit checkout: ${co || em || s.id}${em ? ' | ' + em : ''} - follow up`);
      }
    } else if (event.type === 'charge.refunded' || event.type === 'refund.created' || event.type === 'charge.dispute.created') {
      await markRefunded(event);
    }
  } catch (e) {
    console.error('stripe webhook handle:', e.message);
  }
  return res.json({ received: true });
};

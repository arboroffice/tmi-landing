// Complete Audit intake submission. Verifies the Stripe payment, stores the
// answers, generates + emails the detailed audit deliverable, and returns the
// booking link for the 30-minute strategy call.

const { cors } = require('./_auth');
const dbx = require('./_db');

const BOOKING = 'https://www.tmitechai.com/booking';

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, email, company, industry, answers } = req.body || {};
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'answers required' });

  // Verify payment.
  let paid = false;
  let paidEmail = email;
  try {
    if (process.env.STRIPE_SECRET_KEY && session_id) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const s = await stripe.checkout.sessions.retrieve(session_id);
      paid = s.payment_status === 'paid';
      paidEmail = paidEmail || (s.customer_details && s.customer_details.email) || s.customer_email;
    }
  } catch (e) { console.error('intake verify:', e.message); }
  if (!paid) return res.status(402).json({ error: 'payment required' });

  try {
    const sub = await dbx.insert('audit_submissions', {
      email: paidEmail || null,
      company: company || answers.company || null,
      industry: industry || answers.industry || null,
      answers,
      paid: true,
      session_id: session_id || null,
      status: 'submitted',
      created_at: new Date().toISOString(),
    });

    // Generate + email the deliverable in the background (it takes ~30-60s).
    (async () => {
      try {
        const { buildCompleteAudit } = await import('../agents/gtm/complete-audit.js');
        const md = await buildCompleteAudit({
          company: company || answers.company,
          industry: industry || answers.industry,
          answers,
        });
        await dbx.update('audit_submissions', sub.id, { deliverable: md, status: 'delivered', delivered_at: new Date().toISOString() });

        if (process.env.RESEND_API_KEY && paidEmail) {
          const { Resend } = require('resend');
          await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: 'TMI <support@tmitechai.com>',
            to: paidEmail,
            subject: `Your Complete Audit — ${company || answers.company || 'TMI'}`,
            text: `${md}\n\n--\nBook your 30-minute strategy call: ${BOOKING}`,
          });
        }
        // Notify the team (they prep + run the call).
        if (process.env.RESEND_API_KEY) {
          const { Resend } = require('resend');
          await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: 'TMI <support@tmitechai.com>',
            to: process.env.GTM_DIGEST_EMAIL || 'support@tmitechai.com',
            subject: `PAID Complete Audit: ${company || answers.company} (${paidEmail})`,
            text: md,
          });
        }
      } catch (e) { console.error('deliverable gen:', e.message); }
    })();

    return res.json({ ok: true, id: sub.id, booking: BOOKING });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

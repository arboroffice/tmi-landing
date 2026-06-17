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
      // No signing secret configured (e.g. local dev): accept the parsed body.
      event = Buffer.isBuffer(raw) ? JSON.parse(raw.toString('utf8'))
        : typeof raw === 'string' ? JSON.parse(raw) : raw;
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
    } else if (event.type === 'charge.refunded' || event.type === 'refund.created' || event.type === 'charge.dispute.created') {
      await markRefunded(event);
    }
  } catch (e) {
    console.error('stripe webhook handle:', e.message);
  }
  return res.json({ received: true });
};

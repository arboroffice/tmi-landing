// Creates a Stripe Checkout Session for the $1,000 Complete Audit.
// POST { email?, company? } -> { url }

const { cors } = require('./_auth');

const SITE = 'https://www.tmitechai.com';
const PRICE_CENTS = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 100000); // $1,000

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const { email, company } = req.body || {};
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
            description: 'Detailed operational audit + 30-minute strategy call with the founder and a strategist.',
          },
          unit_amount: PRICE_CENTS,
        },
        quantity: 1,
      }],
      customer_email: email || undefined,
      success_url: `${SITE}/complete-audit-intake?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/complete-audit`,
      metadata: { product: 'complete_audit', company: company || '' },
    });
    return res.json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

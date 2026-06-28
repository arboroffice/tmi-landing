// Create a Stripe subscription checkout session for a paid tier / program / digital-employee rental.
const { cors } = require('./_auth');
module.exports = async function handler(req, res) {
  cors(res); if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { priceId, email, successUrl, cancelUrl } = req.body || {};
  if (!priceId) return res.status(400).json({ error: 'priceId required' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Billing not configured' });
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      success_url: successUrl || 'https://www.tmitechai.com/member?sub=success',
      cancel_url: cancelUrl || 'https://www.tmitechai.com/pricing',
    });
    return res.json({ id: session.id, url: session.url });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

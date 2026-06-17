// Verifies a Stripe Checkout session was paid (gates the intake page).
// GET ?session_id=cs_... -> { paid, email, company }

const { cors } = require('./_auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sid = (req.query && req.query.session_id) || '';
  if (!sid) return res.status(400).json({ paid: false, error: 'session_id required' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ paid: false, error: 'Stripe not configured' });

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(sid);
    return res.json({
      paid: s.payment_status === 'paid',
      email: (s.customer_details && s.customer_details.email) || s.customer_email || null,
      company: (s.metadata && s.metadata.company) || null,
    });
  } catch (e) {
    return res.status(400).json({ paid: false, error: e.message });
  }
};

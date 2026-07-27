// Stripe Checkout for the $5,000 Intelligent Company Audit.
//   POST { email?, company? } -> { url }        (used by the app / fetch flows)
//   GET  ?email=&company=      -> 303 redirect   (a shareable pay link: opening
//                                 it sends the visitor straight to Stripe)

const { cors } = require('./_auth');

const SITE = 'https://www.tmitechai.com';
const PRICE_CENTS = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 500000); // $5,000

async function createSession(email, company) {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'TMI Intelligent Company Audit',
          description: 'Detailed operational audit, Intelligence Score, 30-day plan, and a 30-minute strategy call with the founder and a strategist. Credits toward your build.',
        },
        unit_amount: PRICE_CENTS,
      },
      quantity: 1,
    }],
    customer_email: email || undefined,
    success_url: `${SITE}/thank-you?paid=audit&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/book`,
    metadata: { product: 'intelligent_company_audit', company: company || '' },
  });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const session = await createSession(q.email || '', q.company || '');
      res.writeHead(303, { Location: session.url });
      return res.end();
    }
    if (req.method === 'POST') {
      const { email, company } = req.body || {};
      const session = await createSession(email, company);
      return res.json({ url: session.url });
    }
    return res.status(405).end();
  } catch (e) {
    if (req.method === 'GET') {
      res.writeHead(302, { Location: `${SITE}/book?pay=error` });
      return res.end();
    }
    return res.status(500).json({ error: e.message });
  }
};

// Stripe Checkout for the $25,000 Intelligent Company Audit, which is how an
// engagement with TMI starts. The $5,000 Executive Discovery Session that used
// to sit in front of it is withdrawn.
//
// The amount charged comes from COMPLETE_AUDIT_PRICE_CENTS, so the default
// below is only what applies when that variable is unset. It has to be changed
// in the environment as well, or this still charges whatever it charged before.
//   POST { email?, company? } -> { url }        (used by the app / fetch flows)
//   GET  ?email=&company=      -> 303 redirect   (a shareable pay link: opening
//                                 it sends the visitor straight to Stripe)

const { cors } = require('./_auth');

const SITE = 'https://www.tmitechai.com';
const PRICE_CENTS = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 2500000); // $25,000

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
          description: 'A working session with TMI leadership on operations, people, software, data, workflows, owner dependency, reporting and bottlenecks. You leave knowing what is broken, what it is costing and what to fix first.',
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

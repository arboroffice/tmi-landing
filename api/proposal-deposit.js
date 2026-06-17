// Starts a Stripe Checkout for a build-proposal deposit (or full DIY price).
// GET /api/proposal-deposit?id=<proposalId>&path=diy|dwy|dfy -> 302 to Stripe.
// On payment, stripe-webhook marks the proposal accepted.

const dbx = require('./_db');

const SITE = 'https://www.tmitechai.com';

function redirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.end(); }

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  const pathKey = (req.query && req.query.path) || '';
  if (!id) return redirect(res, '/');
  if (!process.env.STRIPE_SECRET_KEY) return redirect(res, `/build-proposal?id=${id}`);

  let prop;
  try { prop = await dbx.getById('proposals', id); } catch (e) { return redirect(res, '/'); }
  if (!prop || !prop.build) return redirect(res, '/');

  const path = (prop.build.paths || []).find(p => p.key === pathKey);
  if (!path) return redirect(res, `/build-proposal?id=${id}`);

  const amount = Math.round(Number(path.deposit || path.price || 0));
  if (amount <= 0) return redirect(res, `/build-proposal?id=${id}&path=${pathKey}&free=1`);

  const isFull = (path.key === 'diy') || (Number(path.deposit) >= Number(path.price));
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `TMI Build — ${path.name}${isFull ? '' : ' (deposit)'}`,
            description: `${prop.company || 'Build engagement'}${isFull ? '' : ` deposit toward ${path.name} ($${Number(path.price).toLocaleString()} total)`}`,
          },
          unit_amount: amount * 100,
        },
        quantity: 1,
      }],
      customer_email: prop.client_email || undefined,
      success_url: `${SITE}/build-proposal?id=${id}&accepted=1`,
      cancel_url: `${SITE}/build-proposal?id=${id}`,
      metadata: { product: 'build_deposit', proposal_id: id, path: pathKey, company: prop.company || '' },
    });
    return redirect(res, session.url);
  } catch (e) {
    console.error('proposal-deposit:', e.message);
    return redirect(res, `/build-proposal?id=${id}`);
  }
};

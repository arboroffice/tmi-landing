// One-click resume for a captured-but-unpaid Complete Audit lead.
// GET /api/audit-resume?id=<applicationId> -> 302 straight into a fresh Stripe
// Checkout session prefilled with their email. Used in the nurture emails so a
// lead drops back into payment in one click. Falls back to /complete-audit.

const dbx = require('./_db');

const SITE = 'https://www.tmitechai.com';
const PRICE_CENTS = Number(process.env.COMPLETE_AUDIT_PRICE_CENTS || 100000); // $1,000

function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  if (!id) return redirect(res, '/complete-audit');

  let app;
  try { app = await dbx.getById('applications', id); } catch (e) { return redirect(res, '/complete-audit'); }
  if (!app || !app.email) return redirect(res, '/complete-audit');
  if (app.status === 'paid' || app.status === 'booked') return redirect(res, '/complete-audit');
  if (!process.env.STRIPE_SECRET_KEY) return redirect(res, '/complete-audit');

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
            description: 'Detailed operational audit, Intelligence Score, 90-day plan, and a 30-minute strategy call with the founder and a strategist.',
          },
          unit_amount: PRICE_CENTS,
        },
        quantity: 1,
      }],
      customer_email: app.email,
      success_url: `${SITE}/complete-audit-intake?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/complete-audit`,
      metadata: { product: 'complete_audit', company: app.company || '', application_id: app.id },
    });
    return redirect(res, session.url);
  } catch (e) {
    console.error('audit-resume:', e.message);
    return redirect(res, '/complete-audit');
  }
};

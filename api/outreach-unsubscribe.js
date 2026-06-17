// One-click outreach unsubscribe (CAN-SPAM). Adds the address to the do-not-contact
// list and shows a confirmation. No auth (public link in every email).

const { cors } = require('./_auth');
const dbx = require('./_db');

module.exports = async function handler(req, res) {
  cors(res);
  const email = String((req.query && req.query.email) || '').toLowerCase().trim();

  if (email && email.includes('@')) {
    try {
      await dbx.insert('suppression', {
        email,
        domain: email.split('@')[1] || null,
        reason: 'unsubscribe',
        added_at: new Date().toISOString(),
      });
      // Flip any matching lead to unsubscribed.
      const lead = await dbx.findOne('leads', 'email', email);
      if (lead) await dbx.update('leads', lead.id, { status: 'unsubscribed', unsubscribed: true, next_followup_at: null });
    } catch (e) {
      console.error('unsubscribe error:', e.message);
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed | TMI</title>
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#1a1a1a;">
  <div style="font-size:15px;font-weight:700;margin-bottom:24px;">TMI</div>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 12px;">You're unsubscribed</h1>
  <p style="color:#666;line-height:1.6;">${email ? esc(email) : 'This address'} won't receive any more outreach from us. Sorry for the interruption.</p>
</div>`);
};

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

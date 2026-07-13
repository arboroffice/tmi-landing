const db = require('./_db');

// Public unsubscribe for the Founders of the Future Letters newsletter.
// GET ?e=<email> -> sets contacts.unsubscribed = true, shows a confirmation page.
module.exports = async (req, res) => {
  const email = (req.query.e || req.query.email || '').toString().toLowerCase().trim();
  res.setHeader('Content-Type', 'text/html');
  if (!email || !email.includes('@')) return res.status(400).send('Missing email');

  try {
    const contact = await db.findOne('contacts', 'email', email);
    if (contact) await db.update('contacts', contact.id, { unsubscribed: true });
  } catch (e) {
    // fall through to a friendly page regardless
    console.error('[nl-unsubscribe]', e.message);
  }

  res.status(200).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="background:#0a0b14;color:#fff;font-family:Arial,sans-serif;max-width:420px;margin:80px auto;padding:24px;text-align:center;">
<p style="font-size:18px;margin-bottom:12px;">You're unsubscribed.</p>
<p style="color:rgba(255,255,255,0.45);font-size:14px;line-height:1.6;">You won't get any more issues of Founders of the Future Letters. No hard feelings - you can resubscribe anytime.</p>
<p style="margin-top:32px;"><a href="https://www.tmi-technology.com" style="color:#E4FF97;font-size:14px;text-decoration:none;">tmi-technology.com</a></p>
</body></html>`);
};

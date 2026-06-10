const db = require('./_db');

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (!id) return res.status(400).send('Missing id');

  try {
    await db.update('leads', id, { status: 'unsubscribed' });
  } catch (e) {
    // fall through to a friendly page regardless
    console.error('[unsubscribe]', e.message);
  }

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="background:#0a0b14;color:#fff;font-family:Arial,sans-serif;max-width:400px;margin:80px auto;padding:24px;text-align:center;">
<p style="font-size:18px;margin-bottom:12px;">You're unsubscribed.</p>
<p style="color:rgba(255,255,255,0.45);font-size:14px;line-height:1.6;">We won't send you anything else. If you ever want to reconnect, you know where to find us.</p>
<p style="margin-top:32px;"><a href="https://tmi-technology.com" style="color:#E4FF97;font-size:14px;text-decoration:none;">tmi-technology.com</a></p>
</body></html>`);
};

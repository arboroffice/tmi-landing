// Texts the owner about the city-lead team. Runs on Vercel crons.
//   ?mode=morning (about 8am CT daily)  -> yesterday per rep: stops worked, audit links sent, audits sold
//   ?mode=noon    (about noon CT, Mon-Fri) -> heads up for any rep with no stops worked yet today
const twilio = require('twilio');
const { laDate, dayActivity } = require('./_rep-activity');

const FROM_NUMBER = '+18557171044';
const ALERT_NUMBER = '+13373809059';
const money = (n) => '$' + Math.round(n || 0).toLocaleString();

module.exports = async (req, res) => {
  // Vercel sends CRON_SECRET as a bearer token when it is set.
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const mode = req.query.mode === 'noon' ? 'noon' : 'morning';
  try {
    let body = null;
    if (mode === 'morning') {
      const y = laDate(new Date(Date.now() - 864e5));
      const { reps } = await dayActivity(y);
      if (!reps.length) return res.json({ ok: true, skipped: 'no reps' });
      const t = reps.reduce((a, r) => ({ worked: a.worked + r.worked, links: a.links + r.links, sold: a.sold + r.sold, val: a.val + r.sold_value }), { worked: 0, links: 0, sold: 0, val: 0 });
      const lines = reps.map((r) => `${r.first}: ${r.worked} stops, ${r.links} links, ${r.sold} sold`);
      body = `TMI team yesterday: ${t.sold} audit${t.sold === 1 ? '' : 's'} sold${t.val ? ' (' + money(t.val) + ')' : ''}, ${t.links} links sent, ${t.worked} stops.\n${lines.join('\n')}`;
    } else {
      const { reps } = await dayActivity(laDate());
      const idle = reps.filter((r) => r.worked === 0);
      if (!idle.length) return res.json({ ok: true, skipped: 'everyone is working' });
      body = `Heads up: no stops worked yet today by ${idle.map((r) => r.first).join(', ')}.`;
    }
    if (process.env.TWILIO_ACCOUNT_SID) {
      await twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({ body: body.slice(0, 1500), from: FROM_NUMBER, to: ALERT_NUMBER });
    }
    return res.json({ ok: true, mode, body });
  } catch (e) {
    console.error('rep-digest:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = { maxDuration: 60 };

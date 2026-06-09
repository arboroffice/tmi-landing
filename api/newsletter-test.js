const { Resend } = require('resend');
const { renderIssue } = require('./_newsletter-render');

// One-off test send of an on-brand Founders of the Future letter.
// GET ?to=<addr> (defaults to mia@tmitechai.com). Recipient is restricted to
// @tmitechai.com so this utility can never be used to email outsiders.
// Used to preview the on-brand template in a real inbox.

const SAMPLE = {
  title: 'The first thing AI should do in your business',
  subject: 'The first thing AI should do in your business',
  preheader: 'Not replace people. Remember, route, and finish the work so it stops routing through you.',
  format: 'standard',
  body:
`Most owners think about AI backwards. They ask what it can replace. The better question is what it can remember, route, and finish without you in the room.

Here is what actually happens in most businesses. A lead comes in, and someone has to see it, qualify it, write it down, and follow up. A job gets done, and someone has to capture it, invoice it, and chase the payment. A customer asks a question at nine at night, and it waits until morning. None of that is hard. All of it depends on a person being available, paying attention, and not dropping the ball. That dependence is the real ceiling on your business.

AI changes that when it is built into how the work flows, not bolted on as a chatbot. The intake that used to wait now gets answered, qualified, and scheduled in seconds. The invoice that used to slip out days late goes out the moment the job closes. The knowledge that used to live in your best employee's head becomes something the whole team can ask. The owner stops being the router every decision has to pass through.

That is the difference between using AI and becoming an intelligent company. Tools sit on the side and wait to be used. Infrastructure runs the business whether you are watching or not. One makes a task slightly faster. The other changes what the company can do without you.

Look at where your week actually goes. The owner who answers the phone because no one else will. The estimate that sits in a draft folder for three days. The report someone rebuilds by hand every Monday morning. None of it shows up as a line item, which is exactly why it never gets fixed, and exactly where an intelligent system pays for itself first.

You do not need to understand the technology. You need to know which parts of your operation still run on someone remembering to do something, because those are the parts quietly costing you money and capping your growth.

So start there. Pick the one handoff that breaks most often when things get busy. Build the system that makes it impossible to drop. Then do it again. That is how a company stops running on people and starts running on systems.

That is the whole game.`,
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const to = (req.query.to || 'mia@tmitechai.com').toString().toLowerCase().trim();
  // Restrict to TMI addresses, plus the Resend account owner (needed for test
  // delivery while tmitechai.com is unverified in Resend).
  if (!/@tmitechai\.com$/.test(to) && to !== 'mialouviere@gmail.com') {
    return res.status(403).json({ error: 'Test sends restricted to @tmitechai.com addresses' });
  }
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'RESEND_API_KEY not set' });

  const unsub = 'https://www.tmitechai.com/api/nl-unsubscribe?e=' + encodeURIComponent(to);
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    // tmitechai.com may not be verified in Resend yet; onboarding@resend.dev is
    // Resend's universal test sender and delivers to the account owner's inbox.
    const from = req.query.from === 'domain'
      ? 'Founders of the Future <support@tmitechai.com>'
      : 'Founders of the Future <onboarding@resend.dev>';
    const r = await resend.emails.send({
      from,
      to,
      subject: '[TEST] ' + SAMPLE.subject,
      html: renderIssue(SAMPLE, unsub),
    });
    if (r && r.error) return res.status(502).json({ error: JSON.stringify(r.error) });
    return res.json({ ok: true, sent_to: to, body_chars: SAMPLE.body.length, id: (r && r.data && r.data.id) || null });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};

// Morning follow-up reminders for city-lead reps. Runs on a daily Vercel cron.
// Finds each rep's leads whose next_action_at is due today or overdue (and not
// closed) and texts the rep a short nudge with a link to their portal.
const db = require('./_db');
const twilio = require('twilio');
const push = require('./_push');

const FROM_NUMBER = '+18557171044';
const PORTAL = 'cityleads.tmitechai.com';
const TERMINAL = new Set(['won', 'lost', 'not_interested']);

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('1') ? `+${d}` : `+1${d}`;
}

module.exports = async (req, res) => {
  try {
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const cutoff = endToday.getTime();

    const leads = await db.list('rep_leads', { limit: 5000 }).catch(() => []);
    const due = {}, warm = {};
    (leads || []).forEach((l) => {
      if (!l.rep_id || TERMINAL.has(l.status)) return;
      if (l.next_action_at) {
        const t = new Date(l.next_action_at).getTime();
        if (Number.isFinite(t) && t <= cutoff) (due[l.rep_id] = due[l.rep_id] || []).push(l);
      }
      const isWarm = l.priority === 'warm' || l.priority === 'hot' || l.source === 'assigned';
      if (isWarm && l.status === 'new') (warm[l.rep_id] = warm[l.rep_id] || []).push(l);
    });

    const repIds = Array.from(new Set([...Object.keys(due), ...Object.keys(warm)]));
    if (!repIds.length) return res.json({ ok: true, sent: 0, reason: 'nothing due' });

    const canSms = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
    const sms = canSms ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

    let sent = 0, pushed = 0;
    for (const rid of repIds) {
      const rep = await db.getById('reps', rid).catch(() => null);
      if (!rep || rep.status === 'disabled') continue;
      const to = formatPhone(rep.phone);
      const dueList = due[rid] || [], warmList = warm[rid] || [];
      if (!dueList.length && !warmList.length) continue;
      const first = (rep.name || '').split(' ')[0];
      const parts = [];
      if (dueList.length) {
        const names = dueList.slice(0, 3).map((l) => l.business_name || l.contact_name || 'a lead').join(', ');
        parts.push(`${dueList.length} follow-up${dueList.length > 1 ? 's' : ''} due (${names}${dueList.length > 3 ? ', +more' : ''})`);
      }
      if (warmList.length) parts.push(`${warmList.length} new warm lead${warmList.length > 1 ? 's' : ''} to work`);
      const body = `Morning${first ? ' ' + first : ''}. You've got ${parts.join(' and ')}. Jump in: ${PORTAL}`;
      if (sms && to) {
        try { await sms.messages.create({ from: FROM_NUMBER, to, body }); sent++; }
        catch (e) { console.error('rep-reminder sms', rid, e.message); }
      }
      // Best-effort web push to any devices the rep has enabled notifications on.
      try {
        pushed += await push.sendToRep(rep, {
          title: `${parts.join(' and ')}`.replace(/^./, (c) => c.toUpperCase()),
          body: `Tap to work your day, ${first || 'there'}.`,
          url: 'https://' + PORTAL,
          tag: 'daily-reminder',
        });
      } catch (e) { console.error('rep-reminder push', rid, e.message); }
    }
    return res.json({ ok: true, reps_with_due: repIds.length, sent, pushed, sms_configured: canSms, push_configured: push.configured() });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};

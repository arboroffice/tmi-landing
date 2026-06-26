// Cal.com webhook for AFTER-the-booking events. Subscribe these triggers in Cal
// and point them here:
//   MEETING_ENDED            -> post-call: send the plan + next-step nudge
//   BOOKING_CANCELLED        -> recovery:  invite them to grab a new time
//   BOOKING_NO_SHOW_UPDATED  -> recovery:  "sorry we missed you, rebook"
// (BOOKING_CREATED stays on /api/booking-confirmed.) Best-effort throughout.

const db = require('./_db');

const SITE = 'https://www.tmitechai.com';
const CAL_LINK = 'https://cal.com/mia-elianaa-a4n2hk/30min';
const FROM_NUMBER = '+18557171044';
const STOP = ['unsubscribed', 'won', 'client', 'building', 'closed', 'lost', 'rejected', 'do_not_contact'];

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('1') ? `+${d}` : `+1${d}`;
}
function email(to, subject, inner) {
  if (!process.env.RESEND_API_KEY || !to) return Promise.resolve();
  const { Resend } = require('resend');
  return new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'TMI <support@tmitechai.com>', to, subject,
    html: `<!DOCTYPE html><html><body style="background:#fff;font-family:Arial,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:40px 24px;line-height:1.7;">${inner}<p style="margin:28px 0 0;">Mia<br><span style="color:#888;font-size:13px;">Founder, TMI</span></p></body></html>`,
  }).catch(e => console.error('booking-events email:', e.message));
}
function sms(to, body) {
  const t = formatPhone(to);
  if (!t || !process.env.TWILIO_ACCOUNT_SID) return Promise.resolve();
  return require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    .messages.create({ body, from: FROM_NUMBER, to: t }).catch(e => console.error('booking-events sms:', e.message));
}
function cta(url, label) {
  return `<p style="margin:24px 0;"><a href="${url}" style="background:#E4FF97;color:#0a0b14;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;display:inline-block;">${label}</a></p>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  const trigger = body.triggerEvent || body.event || '';
  const payload = body.payload || {};
  const attendees = payload.attendees || [];
  const att = attendees[0] || {};
  const eml = att.email || payload.email;
  const ack = (note) => res.status(200).json({ ok: true, note });
  if (!eml) return ack('no email');

  try {
    const em = String(eml).toLowerCase();
    const app = await db.findOne('applications', 'email', em).catch(() => null);
    if (app && app.status && STOP.includes(app.status)) return ack(`stopped: ${app.status}`);
    const first = ((app && app.name) || att.name || 'there').split(/\s+/)[0];
    const phone = (app && app.phone) || att.phoneNumber || null;
    const unsub = app ? `${SITE}/api/unsubscribe?id=${app.id}` : null;

    // ---- Post-call: the meeting happened -> send the plan + next step --------
    if (trigger === 'MEETING_ENDED') {
      if (app && app.post_call_sent_at) return ack('post-call already sent');
      await email(eml, 'The plan from our call',
        `<p style="margin:0 0 16px;">Hey ${first},</p>
<p style="margin:0 0 16px;">Good talking through your operation. The short version: here is what we would build first, in the order that pays back fastest, and the 30-day path to get there.</p>
<p style="margin:0 0 16px;">When you are ready to move, just reply to this email or grab a time and we will scope it and kick it off. No pressure, no rush.</p>${cta(CAL_LINK, 'Lock in the next step')}${unsub ? `<p style="margin:24px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsub}" style="color:#bbb;">Unsubscribe</a></p>` : ''}`);
      await sms(phone, `${first} - good talking today. Sending over the plan from our call. Ready to move on it? Just reply, or grab a time: ${CAL_LINK} - Mia`);
      if (app) { try { await db.update('applications', app.id, { post_call_sent_at: new Date().toISOString(), status: app.status === 'booked' ? 'call_done' : app.status }); } catch (e) {} }
      return ack('post-call sent');
    }

    // ---- No-show / cancellation -> invite them to grab a new time -----------
    if (trigger === 'BOOKING_NO_SHOW_UPDATED' || trigger === 'BOOKING_CANCELLED') {
      // For the no-show event, only fire if the attendee was actually marked no-show.
      if (trigger === 'BOOKING_NO_SHOW_UPDATED') {
        const noShow = attendees.some(a => a.noShow === true) || payload.noShow === true;
        if (!noShow) return ack('not a no-show');
      }
      if (app && app.rebook_sent_at) return ack('rebook already sent');
      const cancelled = trigger === 'BOOKING_CANCELLED';
      await email(eml, cancelled ? 'Want to grab a new time?' : 'Sorry we missed you',
        `<p style="margin:0 0 16px;">Hey ${first},</p>
<p style="margin:0 0 16px;">${cancelled ? 'No problem on the cancellation.' : 'Looks like we missed each other today, no worries, it happens.'} The offer still stands: 30 minutes to walk through your operation and the first systems we would build. Grab whatever time works.</p>${cta(CAL_LINK, 'Pick a new time')}
<p style="margin:0 0 0;">Or if now is not the moment, just reply and tell me when to circle back.</p>${unsub ? `<p style="margin:24px 0 0;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:16px;"><a href="${unsub}" style="color:#bbb;">Unsubscribe</a></p>` : ''}`);
      await sms(phone, `${first} - ${cancelled ? 'no problem on the cancel' : 'looks like we missed each other'}. Want to grab a new time? ${CAL_LINK} - Mia`);
      if (app) { try { await db.update('applications', app.id, { rebook_sent_at: new Date().toISOString(), status: app.status === 'booked' ? 'no_show' : app.status }); } catch (e) {} }
      return ack('rebook sent');
    }

    return ack(`ignored trigger: ${trigger}`);
  } catch (e) {
    console.error('booking-events:', e.message);
    return res.status(200).json({ ok: true, error: e.message });
  }
};

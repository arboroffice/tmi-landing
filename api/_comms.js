// Central interaction logger. Every email/SMS we send to a person, and every
// reply they send back, gets recorded so the Account 360 timeline is complete.
//
// SMS  -> sms_log   (has a direction column: 'outbound' | 'inbound')
// Email-> activities (type 'email'; activities carries title+body+contact+lead,
//                     and already feeds the Account 360 timeline)
//
// All functions are best-effort and never throw - logging must not break a send.
//
// Backed by Firestore (api/_db.js). The legacy first `db` argument is accepted
// for call-site compatibility but ignored — we always use the shared layer.
const store = require('./_db');

async function resolveIds(_db, { email, phone, contactId, leadId }) {
  let cid = contactId || null;
  let lid = leadId || null;
  const em = email ? String(email).toLowerCase().trim() : null;

  try {
    if (!cid && em) { const c = await store.findOne('contacts', 'email', em); if (c) cid = c.id; }
    if (!cid && phone) { const c = await store.findOne('contacts', 'phone', phone); if (c) cid = c.id; }
    if (!lid && em) {
      const rows = await store.list('leads', { where: [['email', '==', em]], order: 'created_at', ascending: false, limit: 1 });
      if (rows[0]) lid = rows[0].id;
    }
    if (!lid && phone) {
      const rows = await store.list('leads', { where: [['phone', '==', phone]], order: 'created_at', ascending: false, limit: 1 });
      if (rows[0]) lid = rows[0].id;
    }
  } catch (e) {
    console.error('[comms] resolveIds:', e.message);
  }
  return { cid, lid };
}

async function logEmail(_db, { direction = 'outbound', address, subject, body, contactId, leadId, status = 'sent' }) {
  try {
    const { cid, lid } = await resolveIds(null, { email: address, contactId, leadId });
    const dirWord = direction === 'inbound' ? 'From' : 'To';
    const title = `${direction === 'inbound' ? 'Reply: ' : ''}${subject || '(no subject)'}`;
    const preview = body ? '\n\n' + String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500) : '';
    await store.insert('activities', {
      contact_id: cid,
      lead_id: lid,
      type: 'email',
      title,
      body: `${dirWord} ${address || '—'}${status && status !== 'sent' ? ' (' + status + ')' : ''}${preview}`,
    });
  } catch (e) {
    console.error('[comms] logEmail:', e.message);
  }
}

async function logSms(_db, { direction = 'outbound', phone, body, contactId, leadId, status = 'sent', twilioSid = null }) {
  try {
    const { cid } = await resolveIds(null, { phone, contactId, leadId });
    await store.insert('sms_log', {
      contact_id: cid,
      direction,
      phone: phone || '',
      body: body || '',
      status,
      twilio_sid: twilioSid,
    });
  } catch (e) {
    console.error('[comms] logSms:', e.message);
  }
}

function digits(s) { return String(s || '').replace(/\D/g, ''); }
function phoneMatch(a, b) {
  const da = digits(a), db = digits(b);
  if (!da || !db) return false;
  return da.slice(-10) === db.slice(-10);
}

// Monkey-patch a Resend client and/or a Twilio client so every send is logged.
// Pass `email`/`phone` to only log messages addressed to that person (keeps
// internal alerts to the team out of the lead's timeline). Omit them to log
// every send (use when a handler only ever messages the one lead).
function instrument(_db, { resend, sms, leadId = null, contactId = null, email = null, phone = null } = {}) {
  const em = email ? String(email).toLowerCase().trim() : null;

  if (resend && resend.emails && !resend.emails.__instrumented) {
    const orig = resend.emails.send.bind(resend.emails);
    resend.emails.send = async (opts) => {
      const r = await orig(opts);
      try {
        const to = Array.isArray(opts.to) ? opts.to[0] : opts.to;
        if (!em || (to && String(to).toLowerCase().trim() === em)) {
          logEmail(null, { address: to, subject: opts.subject, leadId, contactId });
        }
      } catch (e) { console.error('[comms] instrument email:', e.message); }
      return r;
    };
    resend.emails.__instrumented = true;
  }

  if (sms && sms.messages && !sms.messages.__instrumented) {
    const origCreate = sms.messages.create.bind(sms.messages);
    sms.messages.create = async (opts) => {
      const r = await origCreate(opts);
      try {
        if (!phone || phoneMatch(opts.to, phone)) {
          logSms(null, { phone: opts.to, body: opts.body, leadId, contactId, twilioSid: r && r.sid });
        }
      } catch (e) { console.error('[comms] instrument sms:', e.message); }
      return r;
    };
    sms.messages.__instrumented = true;
  }
}

module.exports = { logEmail, logSms, resolveIds, instrument };

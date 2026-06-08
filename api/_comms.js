// Central interaction logger. Every email/SMS we send to a person, and every
// reply they send back, gets recorded so the Account 360 timeline is complete.
//
// SMS  -> sms_log   (has a direction column: 'outbound' | 'inbound')
// Email-> activities (type 'email'; activities carries title+body+contact+lead,
//                     and already feeds the Account 360 timeline)
//
// All functions are best-effort and never throw - logging must not break a send.

async function resolveIds(db, { email, phone, contactId, leadId }) {
  let cid = contactId || null;
  let lid = leadId || null;
  const em = email ? String(email).toLowerCase().trim() : null;

  try {
    if (!cid && em) {
      const { data } = await db.from('contacts').select('id').eq('email', em).maybeSingle();
      if (data) cid = data.id;
    }
    if (!cid && phone) {
      const { data } = await db.from('contacts').select('id').eq('phone', phone).maybeSingle();
      if (data) cid = data.id;
    }
    if (!lid && em) {
      const { data } = await db.from('leads').select('id').eq('email', em)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) lid = data.id;
    }
    if (!lid && phone) {
      const { data } = await db.from('leads').select('id').eq('phone', phone)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) lid = data.id;
    }
  } catch (e) {
    console.error('[comms] resolveIds:', e.message);
  }
  return { cid, lid };
}

async function logEmail(db, { direction = 'outbound', address, subject, body, contactId, leadId, status = 'sent' }) {
  try {
    const { cid, lid } = await resolveIds(db, { email: address, contactId, leadId });
    const dirWord = direction === 'inbound' ? 'From' : 'To';
    const title = `${direction === 'inbound' ? 'Reply: ' : ''}${subject || '(no subject)'}`;
    const preview = body ? '\n\n' + String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500) : '';
    await db.from('activities').insert({
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

async function logSms(db, { direction = 'outbound', phone, body, contactId, leadId, status = 'sent', twilioSid = null }) {
  try {
    const { cid } = await resolveIds(db, { phone, contactId, leadId });
    await db.from('sms_log').insert({
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
function instrument(db, { resend, sms, leadId = null, contactId = null, email = null, phone = null } = {}) {
  const em = email ? String(email).toLowerCase().trim() : null;

  if (resend && resend.emails && !resend.emails.__instrumented) {
    const orig = resend.emails.send.bind(resend.emails);
    resend.emails.send = async (opts) => {
      const r = await orig(opts);
      try {
        const to = Array.isArray(opts.to) ? opts.to[0] : opts.to;
        if (!em || (to && String(to).toLowerCase().trim() === em)) {
          logEmail(db, { address: to, subject: opts.subject, leadId, contactId });
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
          logSms(db, { phone: opts.to, body: opts.body, leadId, contactId, twilioSid: r && r.sid });
        }
      } catch (e) { console.error('[comms] instrument sms:', e.message); }
      return r;
    };
    sms.messages.__instrumented = true;
  }
}

module.exports = { logEmail, logSms, resolveIds, instrument };

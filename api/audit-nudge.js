const { getSupabase } = require('./_supabase');
const twilio = require('twilio');

const FROM_NUMBER = '+18557171044';
const SITE = 'https://www.tmitechai.com';

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { leadId, name, email, phone, company } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  let db;
  try { db = getSupabase(); } catch (e) {
    return res.status(503).json({ error: 'db not configured' });
  }

  // Check if audit was fully completed
  const { data: submission } = await db
    .from('audit_submissions')
    .select('id, created_at')
    .eq('email', email.toLowerCase().trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (submission) {
    // Audit complete — no nudge needed
    return res.status(200).json({ ok: true, skipped: 'audit_complete' });
  }

  // Check if we already sent a nudge for this lead
  if (leadId) {
    const { data: lead } = await db.from('leads').select('notes, status').eq('id', leadId).single();
    const notes = (() => { try { return JSON.parse(lead?.notes || '{}'); } catch { return {}; } })();
    if (notes.nudge_sent || lead?.status === 'audit_nudge_sent') {
      return res.status(200).json({ ok: true, skipped: 'nudge_already_sent' });
    }
  }

  // No phone — can't text
  if (!phone) return res.status(200).json({ ok: true, skipped: 'no_phone' });

  // Build resume link — pre-fills contact form
  const params = new URLSearchParams({
    n: name || '',
    e: email,
    p: phone || '',
    c: company || '',
  });
  const resumeLink = `${SITE}/audit?resume=1&${params.toString()}`;

  const firstName = (name || 'there').split(' ')[0];
  const smsBody = `Hey ${firstName} - looks like you didn't finish your TMI audit. Pick up where you left off: ${resumeLink}`;

  try {
    const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await sms.messages.create({
      body: smsBody,
      from: FROM_NUMBER,
      to: formatPhone(phone),
    });
  } catch (e) {
    console.error('nudge SMS:', e.message);
    return res.status(500).json({ error: e.message });
  }

  // Mark nudge sent so it never fires again
  if (leadId) {
    const { data: lead } = await db.from('leads').select('notes').eq('id', leadId).single();
    const notes = (() => { try { return JSON.parse(lead?.notes || '{}'); } catch { return {}; } })();
    await db.from('leads').update({
      status: 'audit_nudge_sent',
      notes: JSON.stringify({ ...notes, nudge_sent: true, nudge_sent_at: new Date().toISOString() }),
    }).eq('id', leadId);
  }

  return res.status(200).json({ ok: true, nudge_sent: true });
};

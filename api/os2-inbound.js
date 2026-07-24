// TMI OS — inbound receiver. This is where the outside world reaches a tenant:
// an SMS, an email, a web form, or a logged call gets POSTed here and lands in
// the shared inbox as a thread with the sender remembered as a contact and the
// right worker routed to own it. No JWT: like os2-ingest, the per-tenant ingest
// key is the credential and resolves to exactly one tenant.
//
// Auth: header "x-os-key", or ?key=, or body.key.
// Body: { channel:'sms'|'email'|'form'|'call', from, subject, body, name }
// -> { ok:true, thread_id, message }

const db = require('./_db');
const { cors } = require('./_tenant-auth');
const memory = require('./_osmemory');
const { routeInbound } = require('./_osroute');
const { emitEvent } = require('./_osevents');

const CHANNELS = ['sms', 'email', 'form', 'call'];
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = req.body || {};
  const key = String(req.headers['x-os-key'] || (req.query && req.query.key) || b.key || '').trim();
  if (!key) return res.status(401).json({ error: 'Missing inbound key' });

  const tenant = await db.findOne('os_tenants', 'ingest_key', key).catch(() => null);
  if (!tenant) return res.status(401).json({ error: 'Invalid inbound key' });

  const channel = CHANNELS.includes(b.channel) ? b.channel : 'form';
  const from = String(b.from || '').slice(0, 200).trim();
  const subject = String(b.subject || '').slice(0, 200).trim();
  const body = String(b.body || '').slice(0, 8000);
  const name = String(b.name || '').slice(0, 120).trim();
  if (!from && !body) return res.status(400).json({ error: 'Nothing to receive' });

  try {
    const now = new Date().toISOString();

    // Remember the sender. Email channel senders are email addresses, otherwise phone.
    const isEmail = channel === 'email' || /@/.test(from);
    const contact = await memory.upsertContact(tenant.id, {
      name,
      email: isEmail ? from : '',
      phone: isEmail ? '' : from,
    });

    // Reuse an open thread from the same sender on the same channel within 7 days,
    // otherwise open a new one.
    const openThreads = await db.list('os_threads', {
      where: [['tenant_id', '==', tenant.id]],
      order: 'last_at', ascending: false, limit: 100,
    });
    const cutoff = Date.now() - SEVEN_DAYS;
    let thread = openThreads.find(t =>
      t.status === 'open' && t.channel === channel && t.from === from &&
      (t.last_at ? new Date(t.last_at).getTime() >= cutoff : false)
    ) || null;

    let isNewThread = false;
    if (!thread) {
      isNewThread = true;
      thread = await db.insert('os_threads', {
        tenant_id: tenant.id,
        channel,
        subject: subject || (body ? body.slice(0, 80) : `New ${channel} from ${from || 'unknown'}`),
        contact_id: contact ? contact.id : null,
        from,
        department_id: null,
        worker_id: null,
        status: 'open',
        last_at: now,
        created_at: now,
      });
    }

    const message = await db.insert('os_messages', {
      tenant_id: tenant.id,
      thread_id: thread.id,
      direction: 'in',
      body,
      author: from,
      channel,
      created_at: now,
    });

    // Route to a worker and stamp the thread.
    const route = await routeInbound(tenant, thread).catch(() => ({ department_id: null, worker_id: null }));
    const patch = { last_at: now, status: 'open' };
    if (!thread.contact_id && contact) patch.contact_id = contact.id;
    if (route.department_id) patch.department_id = route.department_id;
    if (route.worker_id) patch.worker_id = route.worker_id;
    await db.update('os_threads', thread.id, patch);

    await db.insert('os_build_log', {
      tenant_id: tenant.id,
      kind: 'inbound',
      summary: `New ${channel} from ${from || 'unknown'}${subject ? `: ${subject}` : ''}.`,
      created_at: now,
    });

    // A brand-new inbound conversation is a new lead: fire the lead_created
    // event so any cascade the owner built on it runs. Best-effort.
    if (isNewThread) {
      await emitEvent(tenant, 'lead_created', { thread_id: thread.id, from, channel }, now).catch(() => {});
    }

    return res.status(200).json({ ok: true, thread_id: thread.id, message });
  } catch (e) {
    console.error('os2-inbound:', e.message);
    return res.status(500).json({ error: 'Could not receive the message' });
  }
};

module.exports.config = { maxDuration: 30 };

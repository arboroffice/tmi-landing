// TMI OS — the weekly digest. Emails each company's owners and managers what
// needs them: drafts awaiting approval, high-priority tasks, what the workforce
// produced this week, and the current numbers. Built from data (no model call)
// so the sweep is fast and reliable.
//
// Two modes:
//   - Cron sweep (protected by CRON_SECRET or Vercel's cron header): every
//     onboarded tenant with digest not disabled.
//   - Preview (Authorization: Bearer tenant token, body { test: true }): sends
//     only the caller's company digest, to the caller.
//
// GET | POST -> { sent, considered }

const db = require('./_db');
const { verifyTenant } = require('./_tenant-auth');

const APP_URL = 'https://os.tmitechai.com';
const FROM = 'TMI OS <support@tmitechai.com>';
const WEEK = 7 * 24 * 3600 * 1000;
const MAX = 60, CONCURRENCY = 3;

module.exports = async function handler(req, res) {
  const token = verifyTenant(req);
  const test = !!(req.body && req.body.test);

  // Preview mode: authenticated tenant asks for its own digest.
  if (token && test) {
    try {
      if (!process.env.RESEND_API_KEY) return res.status(200).json({ sent: 0, note: 'Email is not connected yet, so there is nothing to preview.' });
      const tenant = await db.getById('os_tenants', token.tenant_id);
      if (!tenant) return res.status(404).json({ error: 'Company not found' });
      const to = token.email ? [token.email] : await recipients(tenant.id);
      const sent = await digestFor(tenant, to);
      return res.status(200).json({ sent: sent ? 1 : 0, preview: true });
    } catch (e) {
      console.error('os2-digest preview:', e.message);
      return res.status(500).json({ error: 'Could not send the preview' });
    }
  }

  // Cron mode. Fail closed: require a genuine Vercel cron invocation or a
  // matching secret. If no CRON_SECRET is configured and this is not a Vercel
  // cron, reject rather than run the sweep unauthenticated.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const key = (req.query && req.query.key) || '';
  const isVercelCron = !!req.headers['x-vercel-cron'];
  if (!(isVercelCron || (secret && (auth === `Bearer ${secret}` || key === secret)))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ sent: 0, considered: 0, note: 'no email provider' });

  try {
    const tenants = (await db.list('os_tenants', { where: [['onboarded', '==', true]] }))
      .filter(t => t.digest !== false)
      .slice(0, MAX);

    let sent = 0;
    const queue = tenants.slice();
    async function drain() {
      while (queue.length) {
        const t = queue.shift();
        try { if (await digestFor(t)) sent++; }
        catch (e) { console.error('os2-digest tenant', t.id, e.message); }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, drain));
    return res.status(200).json({ sent, considered: tenants.length });
  } catch (e) {
    console.error('os2-digest:', e.message);
    return res.status(500).json({ error: 'digest failed' });
  }
};

async function recipients(tid) {
  const users = await db.list('os_users', { where: [['tenant_id', '==', tid]] });
  return users
    .filter(u => u.email && u.status !== 'invited' && ['owner', 'manager'].includes(u.role || 'owner'))
    .map(u => u.email);
}

async function digestFor(tenant, toOverride) {
  const tid = tenant.id;
  const w = [['tenant_id', '==', tid]];
  const [metrics, workers, tasks, outputs] = await Promise.all([
    db.list('os_metrics', { where: w }),
    db.list('os_workers', { where: w }),
    db.list('os_tasks', { where: w }),
    db.list('os_outputs', { where: w }),
  ]);

  const now = Date.now();
  const pending = outputs.filter(o => o.status === 'pending');
  const producedThisWeek = outputs.filter(o => now - Date.parse(o.created_at || 0) < WEEK).length;
  const openTasks = tasks.filter(t => t.status !== 'done');
  const hiTasks = openTasks.filter(t => t.priority === 'high');
  const active = workers.filter(x => x.status === 'active');

  // Nothing worth sending.
  if (!workers.length && !pending.length && !openTasks.length) return false;

  const to = toOverride || await recipients(tid);
  if (!to.length) return false;

  const { subject, html, text } = build(tenant, { metrics, active, workers, pending, hiTasks, openTasks, producedThisWeek });
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({ from: FROM, to, subject, html, text });
  await db.insert('os_build_log', { tenant_id: tid, kind: 'digest', summary: 'Sent the weekly digest.', created_at: new Date().toISOString() }).catch(() => {});
  return true;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function build(tenant, d) {
  const name = tenant.name || 'your company';
  const subject = d.pending.length
    ? `${name}: ${d.pending.length} draft${d.pending.length > 1 ? 's' : ''} need your approval`
    : `${name}: your week on TMI OS`;

  const li = s => `<div style="padding:9px 0;border-top:1px solid #ececea;font-size:14px;color:#33343f;">${s}</div>`;
  const section = (title, body) => `<div style="margin-top:26px;"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a8c9e;font-weight:700;">${title}</div>${body}</div>`;

  const pendingBlock = d.pending.length
    ? section('Needs your approval', d.pending.slice(0, 6).map(o => li(`<b>${esc(o.title)}</b> <span style="color:#8a8c9e;">· ${esc(o.worker_name || '')}</span>`)).join(''))
    : '';
  const taskBlock = d.hiTasks.length
    ? section('High priority', d.hiTasks.slice(0, 6).map(t => li(esc(t.title))).join(''))
    : (d.openTasks.length ? section('On your plate', d.openTasks.slice(0, 5).map(t => li(esc(t.title))).join('')) : '');
  const workBlock = d.workers.length
    ? section('Your workforce', li(`<b>${d.active.length}</b> of ${d.workers.length} workers on · <b>${d.producedThisWeek}</b> output${d.producedThisWeek === 1 ? '' : 's'} this week`) +
        d.active.slice(0, 6).map(x => li(`${esc(x.name)} <span style="color:#8a8c9e;">· runs ${esc(x.cadence)}</span>`)).join(''))
    : '';
  const metricBlock = d.metrics.length
    ? section('The numbers', d.metrics.slice(0, 6).map(m => li(`${esc(m.label)}: <b>${esc(m.value || '-')}</b>${m.unit ? ' ' + esc(m.unit) : ''}`)).join(''))
    : '';

  const html = `<div style="margin:0;background:#f6f6f4;padding:28px 14px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ececea;border-radius:16px;overflow:hidden;">
    <div style="background:#0a0b14;color:#fff;padding:22px 26px;">
      <div style="font-size:15px;font-weight:700;">TMI <span style="color:#E4FF97;">OS</span></div>
      <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-top:10px;">${esc(name)}</div>
      <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:4px;">Here is what needs you this week.</div>
    </div>
    <div style="padding:8px 26px 26px;">
      ${pendingBlock}${taskBlock}${workBlock}${metricBlock}
      <a href="${APP_URL}" style="display:inline-block;margin-top:28px;background:#E4FF97;color:#0a0b14;font-weight:700;font-size:14px;text-decoration:none;padding:13px 22px;border-radius:10px;">Open your OS &rarr;</a>
    </div>
  </div>
  <div style="max-width:560px;margin:14px auto 0;text-align:center;color:#8a8c9e;font-size:11px;">TMI Technology · You are getting this because you run ${esc(name)} on TMI OS.<br>Do not want the weekly digest? Turn it off under <a href="${APP_URL}/app?view=settings" style="color:#8a8c9e;">Settings</a>.</div>
</div>`;

  const text = `${name} — your week on TMI OS\n\n` +
    (d.pending.length ? `Needs approval: ${d.pending.length}\n` : '') +
    (d.openTasks.length ? `Open tasks: ${d.openTasks.length} (${d.hiTasks.length} high)\n` : '') +
    `Workers on: ${d.active.length}/${d.workers.length}, ${d.producedThisWeek} outputs this week\n\n` +
    `Open your OS: ${APP_URL}`;

  return { subject, html, text };
}

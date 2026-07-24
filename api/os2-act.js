// TMI OS — the action endpoint. Approving a worker's output does not just mark it
// read: if the output carries a proposed action (a message to a real recipient),
// approving it actually delivers it through the tenant's connected channel and
// records a permanent audit entry. This is the line between an OS that advises
// and one that acts.
//
// POST { action, ... }
//   'approve'  { output_id }              -> { output, act }   approve, and send if there is an action
//   'send'     { action_id }              -> { act }           re-send a staged/failed action
//   'dismiss'  { output_id }              -> { ok: true }
//   'list'                                -> { actions }        recent audit trail
//   'channels'                            -> { channels, autopilot }
//   'connect'  { channel, from, enabled } -> { channels }       (owner) turn a send channel on/off
//   'autopilot'{ on }                     -> { autopilot }      (owner) allow autonomous external sends

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { runAction, normalizeAction } = require('./_osact');
const { evaluate, getPolicies, getSpentToday } = require('./_ospolicy');

function log(tid, summary, kind) {
  return db.insert('os_build_log', { tenant_id: tid, kind: kind || 'act', summary, created_at: new Date().toISOString() }).catch(() => {});
}

// A hard stop the owner set deliberately (a "Never" rule for this action type, or
// the company-wide pause) blocks even a manual approve/send. "Ask me first" does
// not block here, because approving IS the human saying yes.
async function hardStop(tenant, rawAction) {
  const a = normalizeAction(rawAction);
  if (!a || a.channel === 'internal') return null;
  if (!tenant._policies) tenant._policies = await getPolicies(tenant.id).catch(() => []);
  if (!tenant._spentToday) tenant._spentToday = await getSpentToday(tenant.id).catch(() => ({}));
  const d = evaluate(tenant, null, String(a.channel), typeof a.amount === 'number' ? a.amount : undefined);
  return d.mode === 'deny' ? d.reason : null;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || '');

  try {
    if (action === 'list') {
      const actions = await db.list('os_actions', { where: [['tenant_id', '==', tid]], order: 'created_at', ascending: false, limit: 40 });
      return res.status(200).json({ actions });
    }

    if (action === 'channels') {
      const tenant = await db.getById('os_tenants', tid);
      return res.status(200).json({ channels: (tenant && tenant.channels) || {}, autopilot: !!(tenant && tenant.autopilot) });
    }

    // Everything below is a change: viewers are read-only.
    if (!requireRole(t, res, 'manager')) return;

    if (action === 'approve') {
      const output = await db.getById('os_outputs', String(b.output_id || ''));
      if (!output || output.tenant_id !== tid) return res.status(404).json({ error: 'Output not found' });
      const tenant = await db.getById('os_tenants', tid);

      // The approver can edit the draft before it goes out. An edited body is
      // carried into the action so the real send uses the approved wording.
      const editedBody = typeof b.body === 'string' ? b.body.slice(0, 12000) : null;
      const editedSubject = typeof b.subject === 'string' ? b.subject.slice(0, 200) : null;
      let outAction = output.action;
      if (outAction && (editedBody != null || editedSubject != null)) {
        outAction = Object.assign({}, outAction);
        if (editedBody != null) outAction.body = editedBody.slice(0, 8000);
        if (editedSubject != null) outAction.subject = editedSubject;
      }

      let act = null;
      if (outAction) {
        const blocked = await hardStop(tenant, outAction);
        if (blocked) return res.status(200).json({ blocked: true, reason: blocked, output });
        act = await runAction({ tenant, output, worker_name: output.worker_name, actor: t.email || 'owner' }, outAction);
      }
      const patch = { status: 'done', reason: null };
      if (editedBody != null) patch.body = editedBody;
      if (outAction && output.action) patch.action = outAction;
      if (act) patch.action_status = act.status;
      const updated = await db.update('os_outputs', output.id, patch);
      const tail = act ? (act.status === 'sent' ? ` and ${act.detail.replace(/\.$/, '').toLowerCase()}` : act.status === 'staged' ? ' (channel not connected yet)' : act.status === 'failed' ? ' (send failed)' : '') : '';
      await log(tid, `Approved ${output.worker_name || 'a worker'}'s ${output.title}${tail}.`);
      return res.status(200).json({ output: updated, act });
    }

    if (action === 'send') {
      const rec = await db.getById('os_actions', String(b.action_id || ''));
      if (!rec || rec.tenant_id !== tid) return res.status(404).json({ error: 'Action not found' });
      const tenant = await db.getById('os_tenants', tid);
      const output = rec.output_id ? await db.getById('os_outputs', rec.output_id) : null;
      const blocked = await hardStop(tenant, { channel: rec.channel, to: rec.to, subject: rec.subject, body: rec.body });
      if (blocked) return res.status(200).json({ blocked: true, reason: blocked });
      const act = await runAction(
        { tenant, output, worker_name: rec.worker_name, actor: t.email || 'owner' },
        { channel: rec.channel, to: rec.to, subject: rec.subject, body: rec.body }
      );
      if (output && act) await db.update('os_outputs', output.id, { action_status: act.status });
      await log(tid, `Re-sent ${rec.worker_name || 'a'} message to ${rec.to} (${act ? act.status : 'no-op'}).`);
      return res.status(200).json({ act });
    }

    if (action === 'dismiss') {
      const output = await db.getById('os_outputs', String(b.output_id || ''));
      if (!output || output.tenant_id !== tid) return res.status(404).json({ error: 'Output not found' });
      await db.update('os_outputs', output.id, { status: 'dismissed' });
      await log(tid, `Declined ${output.worker_name || 'a worker'}'s ${output.title || 'draft'}.`);
      return res.status(200).json({ ok: true });
    }

    // Channel + autopilot config is owner-only.
    if (action === 'connect') {
      if (!requireRole(t, res, 'owner')) return;
      const channel = ['email', 'sms'].includes(String(b.channel)) ? String(b.channel) : '';
      if (!channel) return res.status(400).json({ error: 'Unknown channel' });
      const tenant = await db.getById('os_tenants', tid);
      const channels = Object.assign({}, tenant && tenant.channels);
      channels[channel] = { from: String(b.from || '').slice(0, 200).trim(), enabled: b.enabled !== false };
      await db.update('os_tenants', tid, { channels });
      await log(tid, `${channels[channel].enabled ? 'Connected' : 'Turned off'} the ${channel} send channel.`, 'data');
      return res.status(200).json({ channels });
    }

    if (action === 'autopilot') {
      if (!requireRole(t, res, 'owner')) return;
      const on = b.on === true;
      await db.update('os_tenants', tid, { autopilot: on });
      await log(tid, on ? 'Turned autopilot on: autonomous workers can now send on their own.' : 'Turned autopilot off: every external send waits for approval.');
      return res.status(200).json({ autopilot: on });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-act:', e.message);
    return res.status(500).json({ error: 'Could not complete that action' });
  }
};

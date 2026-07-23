// TMI OS — Plaid banking endpoint. Drives the "connect your bank" step in
// onboarding and the Live data view.
//
// POST { action, ... }
//   'status'                       -> { configured, connected }
//   'link_token'   (owner)         -> { link_token }
//   'exchange'  { public_token }   -> { ok }  (owner)
//   'sync'         (manager)       -> { cash } (owner/manager)
//   'disconnect'   (owner)         -> { ok }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const plaid = require('./_osplaid');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'status');

  try {
    if (action === 'status') {
      const connected = await plaid.plaidConnected(tid).catch(() => false);
      return res.status(200).json({ configured: plaid.isConfigured(), connected: !!connected });
    }

    const tenant = { id: tid };

    if (action === 'link_token') {
      if (!requireRole(t, res, 'owner')) return;
      try { const link_token = await plaid.createLinkToken(tenant); return res.status(200).json({ link_token }); }
      catch (e) { return res.status(400).json({ error: e.message || 'Could not start the bank connection.' }); }
    }

    if (action === 'exchange') {
      if (!requireRole(t, res, 'owner')) return;
      if (!b.public_token) return res.status(400).json({ error: 'Missing token' });
      try { await plaid.exchangePublicToken(db, tenant, String(b.public_token)); return res.status(200).json({ ok: true }); }
      catch (e) { return res.status(400).json({ error: e.message || 'Could not connect your bank.' }); }
    }

    if (action === 'sync') {
      if (!requireRole(t, res, 'manager')) return;
      try { const r = await plaid.syncPlaid(db, tenant); if (r.skipped) return res.status(400).json({ error: 'No bank connected.' }); return res.status(200).json({ ok: true, cash: r.cash }); }
      catch (e) { return res.status(400).json({ error: e.message || 'Could not read your bank right now.' }); }
    }

    if (action === 'disconnect') {
      if (!requireRole(t, res, 'owner')) return;
      await plaid.disconnectPlaid(db, tenant);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-plaid:', e.message);
    return res.status(500).json({ error: 'Bank request failed' });
  }
};

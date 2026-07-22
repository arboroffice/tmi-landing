// TMI OS — integrations (connectors) management for a tenant. This is where a
// company sees which external systems exist, connects one by handing over its
// credentials, disconnects it, or tests a connector live. Credentials go into
// the encrypted vault (_ossecrets) and are NEVER echoed back to any client.
//
// POST { action, ... }
//   'list'                                   -> { connectors, connected }
//   'connect'    (owner)   { provider, credentials } -> { ok, provider }
//   'disconnect' (owner)   { provider }              -> { ok }
//   'test'       (manager) { provider, action, params } -> { ok, result, staged }

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const connectors = require('./_osconnectors');
const ossecrets = require('./_ossecrets');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;

  const b = req.body || {};
  const action = String(b.action || 'list');
  const tid = t.tenant_id;

  try {
    if (action === 'list') {
      // Which providers exist, and which this tenant has connected. A
      // disconnected provider leaves a tombstone secret ({disconnected:true}),
      // so a doc existing is not enough — it must not be tombstoned.
      let providerSet = [];
      try { providerSet = (await ossecrets.listProviders(tid)) || []; } catch (_e) { providerSet = []; }
      const inSet = new Set(providerSet);

      const connected = [];
      for (const provider of Object.keys(connectors.REGISTRY)) {
        let on = false;
        if (inSet.has(provider)) {
          try {
            const s = await ossecrets.getSecret(tid, provider);
            on = !!(s && s.disconnected !== true);
          } catch (_e) { on = false; }
        }
        connected.push({ provider, connected: on });
      }

      return res.status(200).json({ connectors: connectors.listConnectors(), connected });
    }

    if (action === 'connect') {
      if (!requireRole(t, res, 'owner')) return;
      const provider = String(b.provider || '');
      if (!connectors.getConnector(provider)) return res.status(400).json({ error: 'Unknown provider' });
      const credentials = (b.credentials && typeof b.credentials === 'object') ? b.credentials : null;
      if (!credentials || Object.keys(credentials).length === 0) {
        return res.status(400).json({ error: 'Credentials required' });
      }
      await ossecrets.putSecret(tid, provider, credentials);
      await db.insert('os_build_log', {
        tenant_id: tid, kind: 'integration',
        summary: `Connected ${connectors.getConnector(provider).label}.`,
        created_at: new Date().toISOString(),
      });
      // Never echo credentials.
      return res.status(200).json({ ok: true, provider });
    }

    if (action === 'disconnect') {
      if (!requireRole(t, res, 'owner')) return;
      const provider = String(b.provider || '');
      if (!connectors.getConnector(provider)) return res.status(400).json({ error: 'Unknown provider' });
      // Tombstone: overwrite with a marker so no live credential remains. See
      // report note — a real removeSecret in _ossecrets would be cleaner.
      await ossecrets.putSecret(tid, provider, { disconnected: true });
      await db.insert('os_build_log', {
        tenant_id: tid, kind: 'integration',
        summary: `Disconnected ${connectors.getConnector(provider).label}.`,
        created_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'test') {
      if (!requireRole(t, res, 'manager')) return;
      const provider = String(b.provider || '');
      const conn = connectors.getConnector(provider);
      if (!conn) return res.status(400).json({ error: 'Unknown provider' });
      const actionKey = String(b.action_key || b.actionKey || b.op || '');
      // Accept the connector action either as its own field or nested params.
      const key = actionKey || (b.params && b.params.action) || '';
      if (!key) return res.status(400).json({ error: 'action to test required' });
      const params = (b.params && typeof b.params === 'object') ? b.params : {};

      let secret = null;
      try { secret = await ossecrets.getSecret(tid, provider); } catch (_e) { secret = null; }
      const out = await connectors.execute(provider, key, params, secret);
      return res.status(200).json({ ok: !!(out && out.ok), result: out && out.result, staged: !!(out && out.staged), error: out && out.error });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-integrations:', e.message);
    return res.status(500).json({ error: 'Could not complete the integration action' });
  }
};

module.exports.config = { maxDuration: 30 };

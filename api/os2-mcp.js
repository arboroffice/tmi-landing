// TMI OS — MCP server connections. A company connects any remote MCP server by
// URL (optionally with a token); the OS validates it with a real handshake,
// discovers its tools, and stores the connection so TMI can wire those tools
// into the company's workers. The token is stored encrypted in the vault and
// never returned to the browser.
//
// POST { action, ... }
//   'list'                          -> { servers }
//   'connect' { name, url, token }  -> { server }   (owner)
//   'refresh' { id }                -> { server }   (manager)
//   'remove'  { id }                -> { ok: true } (owner)

const db = require('./_db');
const { requireTenant, requireRole, cors } = require('./_tenant-auth');
const { putSecret, getSecret, delSecret } = require('./_ossecrets');
const { probe } = require('./_osmcp');

const PROV = (id) => 'mcp:' + id;

function shape(c) {
  return {
    id: c.id, name: c.name || 'MCP server', url: c.mcp_url || '',
    status: c.status || 'live', tools: c.tools || [], tool_count: (c.tools || []).length,
    server_name: c.server_name || '', last_data_at: c.last_data_at || null,
  };
}

async function ownMcp(tid, id) {
  const c = await db.getById('os_connections', String(id || '')).catch(() => null);
  if (!c || c.tenant_id !== tid || c.provider !== 'mcp') return null;
  return c;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const t = requireTenant(req, res);
  if (!t) return;
  const tid = t.tenant_id;
  const b = req.body || {};
  const action = String(b.action || 'list');

  try {
    if (action === 'list') {
      if (!requireRole(t, res, 'manager')) return;
      const rows = await db.list('os_connections', { where: [['tenant_id', '==', tid]] });
      const servers = rows.filter((c) => c.provider === 'mcp').map(shape);
      return res.status(200).json({ servers });
    }

    if (action === 'connect') {
      if (!requireRole(t, res, 'owner')) return;
      const name = String(b.name || '').slice(0, 80).trim();
      const url = String(b.url || '').trim();
      const token = String(b.token || '').trim();
      if (!url) return res.status(400).json({ error: 'An MCP server URL is required.' });

      let result;
      try { result = await probe(url, token || null); }
      catch (e) { return res.status(400).json({ error: e.message || 'Could not connect to that MCP server.' }); }

      const now = new Date().toISOString();
      const conn = await db.insert('os_connections', {
        tenant_id: tid, provider: 'mcp', kind: 'mcp',
        name: name || result.serverInfo.name || 'MCP server',
        server_name: result.serverInfo.name || '',
        mcp_url: url, tools: result.tools, status: 'live',
        created_at: now, last_data_at: now,
      });
      if (token) await putSecret(tid, PROV(conn.id), { token }).catch(() => {});
      await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: `Connected MCP server ${conn.name} (${result.tools.length} tools).`, created_at: now }).catch(() => {});
      return res.status(201).json({ server: shape(conn) });
    }

    if (action === 'refresh') {
      if (!requireRole(t, res, 'manager')) return;
      const c = await ownMcp(tid, b.id);
      if (!c) return res.status(404).json({ error: 'MCP server not found' });
      const secret = await getSecret(tid, PROV(c.id)).catch(() => null);
      let result;
      try { result = await probe(c.mcp_url, secret && secret.token); }
      catch (e) { return res.status(400).json({ error: e.message || 'Could not reach that MCP server.' }); }
      const updated = await db.update('os_connections', c.id, {
        tools: result.tools, server_name: result.serverInfo.name || c.server_name || '',
        status: 'live', last_data_at: new Date().toISOString(),
      });
      return res.status(200).json({ server: shape(updated) });
    }

    if (action === 'remove') {
      if (!requireRole(t, res, 'owner')) return;
      const c = await ownMcp(tid, b.id);
      if (!c) return res.status(404).json({ error: 'MCP server not found' });
      await delSecret(tid, PROV(c.id)).catch(() => {});
      await db.remove('os_connections', c.id).catch(() => {});
      await db.insert('os_build_log', { tenant_id: tid, kind: 'data', summary: `Removed MCP server ${c.name}.`, created_at: new Date().toISOString() }).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('os2-mcp:', e.message);
    return res.status(500).json({ error: 'Could not manage MCP servers right now.' });
  }
};

// TMI OS — minimal MCP (Model Context Protocol) client. Lets a company connect
// ANY remote MCP server by URL, the same way Claude connects to a huge catalog
// of tools. We speak the Streamable HTTP transport: a JSON-RPC initialize
// handshake, then tools/list to discover what the server can do. The server's
// tools then become things TMI can wire into this company's workers.
//
// Everything customer-supplied (the URL) goes through the shared SSRF guard,
// and the auth token is stored encrypted by the caller, never here.

const { safeFetch } = require('./_osnet');

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'TMI-OS', version: '1.0' };

// One JSON-RPC call over Streamable HTTP. Handles both a plain JSON response and
// an SSE (text/event-stream) response, which MCP servers may use either way.
async function rpc(url, token, sessionId, message) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const r = await safeFetch(url, { method: 'POST', headers, body: JSON.stringify(message) }, 10000);
  const newSession = (r.headers && r.headers.get && r.headers.get('mcp-session-id')) || sessionId || null;
  if (!r.ok && r.status !== 200) {
    // 202 for notifications is fine; other non-2xx is an error.
    if (r.status === 202) return { session: newSession, json: null };
    throw new Error(`The MCP server returned ${r.status}.`);
  }
  const ctype = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
  const text = (await r.text()).slice(0, 500000);
  let json = null;
  if (ctype.includes('text/event-stream')) {
    // Take the last `data:` JSON line that parses as a JSON-RPC response.
    const lines = text.split(/\r?\n/).filter((l) => l.startsWith('data:'));
    for (let i = lines.length - 1; i >= 0; i--) {
      try { const obj = JSON.parse(lines[i].slice(5).trim()); if (obj && (obj.result || obj.error || obj.id != null)) { json = obj; break; } } catch (_e) {}
    }
  } else if (text.trim()) {
    try { json = JSON.parse(text); } catch (_e) { json = null; }
  }
  return { session: newSession, json };
}

// Connect to an MCP server and list its tools. Returns { serverInfo, tools }.
// Throws a readable error on any failure so the UI can show it.
async function probe(url, token) {
  const init = await rpc(url, token, null, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
  });
  if (!init.json || init.json.error) {
    throw new Error(init.json && init.json.error ? (init.json.error.message || 'Server rejected the connection.') : 'No response from the MCP server.');
  }
  const serverInfo = (init.json.result && init.json.result.serverInfo) || {};
  const session = init.session;

  // Best-effort: tell the server we finished initializing (notification, no reply).
  try {
    await rpc(url, token, session, { jsonrpc: '2.0', method: 'notifications/initialized' });
  } catch (_e) { /* not fatal */ }

  const list = await rpc(url, token, session, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  if (!list.json || list.json.error) {
    throw new Error(list.json && list.json.error ? (list.json.error.message || 'Could not list tools.') : 'Could not list the server tools.');
  }
  const rawTools = (list.json.result && Array.isArray(list.json.result.tools)) ? list.json.result.tools : [];
  const tools = rawTools.slice(0, 200).map((t) => ({
    name: String(t.name || '').slice(0, 120),
    description: String(t.description || '').slice(0, 300),
  })).filter((t) => t.name);

  return {
    serverInfo: { name: String(serverInfo.name || '').slice(0, 120), version: String(serverInfo.version || '').slice(0, 40) },
    tools,
  };
}

module.exports = { probe, PROTOCOL_VERSION };

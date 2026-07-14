const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

// Agent Builder endpoint — the Chief of Staff's ability to build new agents.
//   GET                       -> { specs, runs }
//   POST { propose:'need' }    -> author a draft spec from a plain-language need.
//   POST { create: spec }      -> save a provided spec as a draft.
//   POST { activate:id } | { pause:id }
//   POST { run:id }            -> execute a spec now (async).
//   POST { remove:id }         -> delete a spec.
//   x-vercel-cron              -> run every active spec that is due.
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cron: run due active agents, no JWT.
  if (req.headers['x-vercel-cron']) {
    try {
      const { runDueAgents } = await import('../agents/gtm/agent-runtime.js');
      const r = await runDueAgents();
      return res.json({ ok: true, cron: true, ran: r.ran });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const specs = await dbx.list('agent_specs', { order: 'created_at', ascending: false, limit: 50 });
      const runs = await dbx.list('agent_runs', { order: 'generated_at', ascending: false, limit: 10 });
      return res.json({ specs: specs || [], runs: runs || [] });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = req.body || {};
    try {
      const rt = () => import('../agents/gtm/agent-runtime.js');

      if (body.propose) {
        const { proposeAgentSpec, saveDraftSpec } = await rt();
        const spec = await proposeAgentSpec(String(body.propose));
        const saved = await saveDraftSpec(spec, 'admin');
        return res.json({ ok: true, spec: saved });
      }
      if (body.create) {
        const { saveDraftSpec } = await rt();
        const saved = await saveDraftSpec(body.create, 'admin');
        return res.json({ ok: true, spec: saved });
      }
      if (body.activate) {
        await dbx.update('agent_specs', body.activate, { status: 'active' });
        return res.json({ ok: true });
      }
      if (body.pause) {
        await dbx.update('agent_specs', body.pause, { status: 'paused' });
        return res.json({ ok: true });
      }
      if (body.remove) {
        // soft delete: mark archived so runs history stays intact
        await dbx.update('agent_specs', body.remove, { status: 'archived' });
        return res.json({ ok: true });
      }
      if (body.run) {
        const spec = await dbx.getById('agent_specs', body.run);
        if (!spec) return res.status(404).json({ error: 'spec not found' });
        const { runCustomAgent } = await rt();
        runCustomAgent(spec).catch(err => console.error('run agent error:', err));
        return res.json({ ok: true, message: `${spec.name} started` });
      }
      return res.status(400).json({ error: 'Nothing to do' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

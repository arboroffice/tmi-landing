const { cors, requireAuth } = require('./_auth');
const dbx = require('./_db');

// Chief of Staff endpoint.
//   GET            -> latest plan, its open actions, and the agent catalog.
//   GET ?list=1    -> the last 12 plans.
//   POST|PATCH { trigger:true }        -> run the Chief of Staff agent.
//   POST { runAgent:'<key>' }          -> dispatch an internal agent (human-approved).
//   POST { completeAction:'<id>', status } -> mark an action done/dismissed.

// Internal agents the cockpit can run in one click (no customer contact).
const RUN_MAP = {
  'ceo': ['../agents/gtm/ceo.js', 'runCeoAgent'],
  'founder-brief': ['../agents/gtm/founder-brief.js', 'runFounderBrief'],
  'prospect-gen': ['../agents/gtm/prospect-gen.js', 'runProspectGen'],
};
// Customer-facing agents are NOT one-click fired here; the cockpit deep-links to
// the existing guarded admin page so a human runs them with the usual controls.
const EXTERNAL_LINKS = {
  'collections': '/admin-invoices',
  'reactivate': '/admin-outbound',
  'campaign-send': '/admin-campaign',
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Vercel cron (daily) triggers a planning run without a JWT.
  if (req.headers['x-vercel-cron']) {
    try {
      const { runChiefOfStaff } = await import('../agents/gtm/chief-of-staff.js');
      runChiefOfStaff().catch(err => console.error('chief-of-staff cron error:', err));
      return res.json({ ok: true, cron: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      if (req.query && (req.query.list === '1' || req.query.list === 'true')) {
        const plans = await dbx.list('cos_plans', { order: 'generated_at', ascending: false, limit: 12 });
        return res.json({ plans: plans || [] });
      }
      const plans = await dbx.list('cos_plans', { order: 'generated_at', ascending: false, limit: 1 });
      const plan = (plans && plans[0]) || null;
      const actions = await dbx.list('cos_actions', { where: [['status', '==', 'open']], order: 'created_at', ascending: false, limit: 40 });
      let catalog = [];
      try { catalog = (await import('../agents/gtm/chief-of-staff.js')).AGENT_CATALOG || []; } catch {}
      return res.json({ plan, actions: actions || [], catalog });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = req.body || {};

    // 1) Run the Chief of Staff planning agent.
    if (body.trigger) {
      try {
        const { runChiefOfStaff } = await import('../agents/gtm/chief-of-staff.js');
        runChiefOfStaff().catch(err => console.error('chief-of-staff run error:', err));
        return res.json({ ok: true, message: 'Chief of Staff started' });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // 2) Mark an action complete / dismissed.
    if (body.completeAction) {
      try {
        await dbx.update('cos_actions', body.completeAction, {
          status: body.status === 'dismissed' ? 'dismissed' : 'done',
          closed_at: new Date().toISOString(),
        });
        return res.json({ ok: true });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // 3) Dispatch a digital agent.
    if (body.runAgent) {
      const key = String(body.runAgent);
      if (EXTERNAL_LINKS[key]) {
        // Customer-facing: don't fire here, send them to the guarded page.
        return res.status(409).json({ needsManual: true, link: EXTERNAL_LINKS[key], message: `${key} contacts customers. Run it from ${EXTERNAL_LINKS[key]}.` });
      }
      const entry = RUN_MAP[key];
      if (!entry) return res.status(400).json({ error: 'Unknown or non-runnable agent: ' + key });
      try {
        const mod = await import(entry[0]);
        const fn = mod[entry[1]];
        if (typeof fn !== 'function') return res.status(500).json({ error: 'agent function missing' });
        fn().catch(err => console.error(`dispatch ${key} error:`, err));
        return res.json({ ok: true, message: `${key} started` });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    return res.status(400).json({ error: 'Nothing to do' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

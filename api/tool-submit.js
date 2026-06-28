// Interactive tools/assessments backend + lead engine. Public: anyone can submit a
// tool's answers; we score it server-side, store the assessment, and capture the
// taker as a lead. This is the media-site's primary lead generator.
//
//   POST /api/tool-submit { tool, answers, email, name, company }
//   -> { result } and a stored assessment + upserted lead.

const db = require('./_db');
const { cors } = require('./_auth');

const band100 = (s) => s >= 75 ? 'Strong' : s >= 55 ? 'Developing' : s >= 40 ? 'At risk' : 'Critical';
const avgTo100 = (answers, max = 5) => {
  const vals = Object.values(answers || {}).map(Number).filter(n => !Number.isNaN(n));
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) / max * 100);
};
const num = (a, k, d = 0) => { const v = Number((a || {})[k]); return Number.isNaN(v) ? d : v; };

// Each tool: { label, type:'score'|'calc', compute(answers) -> result object }
const TOOLS = {
  'ai-readiness': { label: 'AI Readiness', type: 'score', compute: (a) => { const s = avgTo100(a); return { score: s, band: band100(s) }; } },
  'business-score': { label: 'Business Score', type: 'score', compute: (a) => { const s = avgTo100(a); return { score: s, band: band100(s) }; } },
  'automation-score': { label: 'Automation Score', type: 'score', compute: (a) => { const s = avgTo100(a); return { score: s, band: band100(s) }; } },
  'founder-dependency': { label: 'Founder Dependency', type: 'score', compute: (a) => {
      // higher answers = more dependent = worse; invert so high score = healthy
      const dep = avgTo100(a); const s = 100 - dep;
      return { score: s, dependency: dep, band: dep >= 60 ? 'Owner is the bottleneck' : dep >= 35 ? 'Moderate dependency' : 'Runs without you' };
  } },
  'roi': { label: 'Automation ROI', type: 'calc', compute: (a) => {
      const employees = num(a, 'employees', 0), hoursPerWeek = num(a, 'hoursPerWeek', 0), wage = num(a, 'hourlyWage', 35), automatable = num(a, 'automatablePct', 40) / 100;
      const weeklyHours = employees * hoursPerWeek * automatable;
      const annualSavings = Math.round(weeklyHours * wage * 52);
      return { annualSavings, weeklyHoursRecovered: Math.round(weeklyHours), assumptions: { wage, automatable } };
  } },
  'employee-cost': { label: 'Employee Cost', type: 'calc', compute: (a) => {
      const salary = num(a, 'salary', 0), benefitsPct = num(a, 'benefitsPct', 25) / 100, overheadPct = num(a, 'overheadPct', 20) / 100;
      const trueCost = Math.round(salary * (1 + benefitsPct + overheadPct));
      return { trueAnnualCost: trueCost, monthly: Math.round(trueCost / 12) };
  } },
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { tool, answers, email, name, company } = req.body || {};
  const def = TOOLS[tool];
  if (!def) return res.status(400).json({ error: 'Unknown tool', tools: Object.keys(TOOLS) });

  let result;
  try { result = def.compute(answers || {}); } catch (e) { return res.status(400).json({ error: 'Bad answers: ' + e.message }); }

  // Store the assessment + capture the lead (email optional but enables capture).
  try {
    const em = email ? String(email).toLowerCase().trim() : null;
    await db.insert('assessments', { tool, tool_label: def.label, email: em, name: name || null, company: company || null, answers: answers || {}, result, created_at: new Date().toISOString() });
    if (em && em.includes('@')) {
      const existing = await db.findOne('leads', 'email', em);
      const note = `${def.label}: ${JSON.stringify(result)}`;
      if (!existing) {
        await db.insert('leads', { email: em, owner_name: name || null, company_name: company || null, source: `tool:${tool}`, status: 'new', score: 'warm', unsubscribed: false, research_notes: note, created_at: new Date().toISOString() });
      } else if (!['won', 'client', 'building', 'unsubscribed'].includes(existing.status)) {
        await db.update('leads', existing.id, { research_notes: `${existing.research_notes || ''}\n${note}`.trim(), score: 'hot' });
      }
      try { await db.upsertByField('contacts', 'email', em, { email: em, first_name: (name || '').split(' ')[0] || null, company: company || null, tags: ['tool'] }); } catch {}
    }
  } catch (e) { console.error('tool-submit store:', e.message); }

  return res.json({ tool, label: def.label, type: def.type, result });
};

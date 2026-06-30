// The diagnosis engine for the Intelligent Company Audit. Takes the verified
// research dossier + the owner's answers and produces a specific, evidence-backed
// diagnosis: the real problems in THIS operation, what each is costing, and the
// exact TMI fix + path for each. This is what turns the audit from a questionnaire
// into "here is what is wrong and how we help." Grounded only in the evidence and
// their own numbers - it never invents internal figures.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// The TMI offering catalog the model maps each problem onto. These are the
// installable "offices" of the digital workforce plus the platform layers. Keep
// names + urls in sync with the live solutions / departments / platform pages.
const CATALOG = `TMI offices and layers to map fixes onto (use the exact name and url):
- Sales Office - answers, qualifies, books, follows up, reactivates, reports | /departments
- Dispatch Office - estimates, scheduling, dispatch, customer updates, reviews | /departments
- Customer Success Office - receptionist, support, scheduling, onboarding, FAQ | /departments
- Marketing Office - content, social, ads, SEO, reputation | /departments
- Operations Office - scheduling, SOPs, knowledge base, vendor and job-cost tracking | /departments
- Back Office - invoicing, AR, AP, collections, bookkeeping, financial reporting | /back-office
- HR Office - recruiting, screening, onboarding, training, scheduling | /departments
- Executive Office - chief of staff, daily digest, KPIs, decision support | /departments
- Compliance Office - certs, safety docs, permits, audit prep | /departments
- Intelligence Office - command center, organizational memory, dashboards, forecasting | /platform
- Operations OS - the central system every office runs on | /platform`;

// The seven business functions we score for company intelligence (0-100 each).
const FUNCTIONS = ['Sales', 'Marketing', 'Operations', 'Finance', 'Customer Service', 'HR', 'Leadership'];

function clamp100(n, dflt = 30) {
  n = parseInt(String(n).match(/\d{1,3}/), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(0, Math.min(100, n));
}

export async function diagnoseOperation({ company, industry, research, answers = {} } = {}) {
  const r = research || {};
  const answerLines = Object.entries(answers)
    .filter(([k, v]) => v != null && String(v).trim() !== '' && !k.startsWith('_'))
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join('\n');

  const evidence = [
    `Company: ${company || answers.company || 'unknown'}`,
    `Industry: ${industry || answers.industry || (r.firmographics && r.firmographics.industry) || 'unknown'}`,
    r.summary ? `Research read: ${r.summary}` : '',
    (r.techStack && r.techStack.length) ? `Software detected: ${r.techStack.join(', ')}` : 'Software detected: none (likely manual: phone, email, paper, spreadsheets)',
    (r.signals && r.signals.length) ? `Back-office roles they staff: ${r.signals.join(', ')}` : '',
    (r.opsSignals && r.opsSignals.length) ? `How they operate: ${r.opsSignals.join('; ')}` : '',
    (r.frictionSignals && r.frictionSignals.length) ? `Gaps detected (what is missing): ${r.frictionSignals.join('; ')}` : '',
    r.maps ? `Google: ${[r.maps.rating ? r.maps.rating + ' stars' : '', r.maps.reviewCount ? r.maps.reviewCount + ' reviews' : '', r.maps.category].filter(Boolean).join(', ')}` : '',
    r.firmographics ? `Firmographics: employees=${r.firmographics.employeeCount || '?'}, revenue=${r.firmographics.revenue || '?'}, founded=${r.firmographics.foundedYear || '?'}` : '',
    (r.found && r.found.length) ? `Verified facts:\n- ${r.found.join('\n- ')}` : '',
    answerLines ? `\nWhat the owner told us (confirmed):\n${answerLines}` : '',
  ].filter(Boolean).join('\n');

  const system = `You are TMI's senior operations strategist. You diagnose operations-heavy businesses ($5M+, trades / industrial / field service / manufacturing / logistics / services) and name their REAL problems from evidence, the way a sharp operator would after digging.

You diagnose through three lenses:
1. Founder bottleneck - decisions, approvals, follow-up, knowledge route through one person.
2. Information bottleneck - status, numbers, history live in heads, texts, disconnected tools; nobody can see the operation without calling someone.
3. Operational latency - lag between stages (lead to response, job done to invoice, decision waiting on a person).

Hard rules:
- Every problem must cite the specific evidence that points to it (a detected tool or lack of one, a hiring title, a review pattern, a number they gave). No generic "they probably struggle with efficiency."
- Cost each problem in dollars or hours ONLY from numbers actually present (revenue, headcount, close rate, avg job, lead volume, response time). If the math is not supported, say "Quantify on the call" instead of inventing a figure. Show the simple math when you can.
- Map each problem to ONE TMI offering from the catalog, using its exact name and url, and recommend a path: DFY (we build and run it), DWY (we build with your team), or DIY (we hand you the plan).
- Specific to THIS company and niche. No AI hype. No em dashes.
- Output ONLY a JSON object. No prose around it.`;

  const user = `Diagnose this operation from the evidence.

${evidence}

${CATALOG}

Return ONLY this JSON:
{
  "headline": "one sentence naming the single biggest constraint in this specific operation",
  "fit": { "good": true, "reason": "one line on whether this is a fit for a $5M+ Delete/Connect/Build transformation" },
  "issues": [
    {
      "id": "short-slug",
      "title": "the problem, named specifically",
      "lens": "Founder | Information | Latency",
      "evidence": "the exact signal that points to this",
      "symptom": "what this feels like day to day for the owner",
      "cost": "estimated dollars or hours with the math, or 'Quantify on the call'",
      "severity": "high | medium | low",
      "fix": "one concrete line on what we would build to fix it",
      "offering": "exact offering name from the catalog",
      "offering_url": "the matching url",
      "path": "DFY | DWY | DIY"
    }
  ],
  "summary": "2 to 3 sentences: the through-line across these problems and what changes when they are fixed",
  "scores": {
    "Visibility": "1 to 5: can they see the operation in real time? 1 = runs on memory/texts, 5 = a live dashboard",
    "Traceability": "1 to 5: can any job/number/decision be traced to a system of record? 1 = lives in heads, 5 = fully logged",
    "Accountability": "1 to 5: does work get owned and followed up without the owner chasing? 1 = owner chases everything, 5 = systems hold it",
    "Predictability": "1 to 5: can they forecast capacity, cash, and outcomes? 1 = pure reaction, 5 = predictable",
    "Control": "1 to 5: can the owner step away without it breaking? 1 = it runs through them, 5 = it runs without them"
  },
  "companyScore": "0 to 100: overall Company Intelligence Score - how systems-driven the whole operation is today (manual, disconnected operations land 20 to 45)",
  "departments": [
    {"name":"Sales","score":"0 to 100, how intelligent/systematized this function is today","note":"one short phrase on why"},
    {"name":"Marketing","score":"0 to 100","note":"one short phrase"},
    {"name":"Operations","score":"0 to 100","note":"one short phrase"},
    {"name":"Finance","score":"0 to 100","note":"one short phrase"},
    {"name":"Customer Service","score":"0 to 100","note":"one short phrase"},
    {"name":"HR","score":"0 to 100","note":"one short phrase"},
    {"name":"Leadership","score":"0 to 100","note":"one short phrase"}
  ],
  "pitch": [
    {"office":"the office to install first (e.g. Sales Office), exact name from the catalog","url":"matching url","why":"one line tying it to the lowest-scoring, highest-cost function","path":"DFY | DWY | DIY"}
  ]
}

Score the 5 dimensions 1 to 5 honestly from the evidence. Then score each of the 7 business functions 0 to 100 for how intelligent (systematized, connected, self-running) it is today, lowest where the evidence shows manual work or gaps. The companyScore is the weighted read across them. In "pitch", rank 2 to 4 offices to install in priority order, lowest-scoring and highest-cost function first - this is the internal recommendation for what to sell them. Return 3 to 6 issues, ranked most to least severe.`;

  let parsed = {};
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2400,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const raw = msg.content[0].text;
    const j = raw.match(/\{[\s\S]*\}/);
    parsed = j ? JSON.parse(j[0]) : {};
  } catch (e) {
    parsed = { error: e.message };
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6).map((it, i) => ({
    id: it.id || ('issue-' + i),
    title: it.title || 'Operational gap',
    lens: it.lens || 'Information',
    evidence: it.evidence || '',
    symptom: it.symptom || '',
    cost: it.cost || 'Quantify on the call',
    severity: (it.severity || 'medium').toLowerCase(),
    fix: it.fix || '',
    offering: it.offering || '',
    offering_url: it.offering_url || '/audit',
    path: it.path || 'DFY',
  })) : [];

  // Clamp the 5-dimension scores to 1-5 integers (only keep valid ones).
  let scores = null;
  if (parsed.scores && typeof parsed.scores === 'object') {
    scores = {};
    for (const k of ['Visibility', 'Traceability', 'Accountability', 'Predictability', 'Control']) {
      const n = parseInt(String(parsed.scores[k]).match(/[1-5]/), 10);
      if (n >= 1 && n <= 5) scores[k] = n;
    }
    if (!Object.keys(scores).length) scores = null;
  }

  // Per-function company-intelligence scores (0-100) + overall.
  let departments = [];
  if (Array.isArray(parsed.departments)) {
    departments = parsed.departments
      .filter(d => d && d.name && FUNCTIONS.includes(d.name))
      .map(d => ({ name: d.name, score: clamp100(d.score), note: String(d.note || '').slice(0, 80) }));
  }
  const companyScore = parsed.companyScore != null
    ? clamp100(parsed.companyScore, departments.length ? Math.round(departments.reduce((s, d) => s + d.score, 0) / departments.length) : 30)
    : (departments.length ? Math.round(departments.reduce((s, d) => s + d.score, 0) / departments.length) : null);

  // Internal pitch map: which offices to install, in priority order.
  const pitch = Array.isArray(parsed.pitch)
    ? parsed.pitch.filter(p => p && p.office).slice(0, 4).map(p => ({
        office: String(p.office).slice(0, 60),
        url: p.url || '/departments',
        why: String(p.why || '').slice(0, 160),
        path: ['DFY', 'DWY', 'DIY'].includes(String(p.path).toUpperCase()) ? String(p.path).toUpperCase() : 'DFY',
      }))
    : [];

  return {
    headline: parsed.headline || '',
    fit: parsed.fit || null,
    issues,
    summary: parsed.summary || '',
    scores,
    companyScore,
    departments,
    pitch,
  };
}

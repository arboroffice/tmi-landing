const db = require('./_db');
const { requireAuth, cors } = require('./_auth');

// Turn a recorded sales-call transcript into durable company knowledge, a PRD,
// or an SOP, using Claude. Admin-only, synchronous so the UI gets the artifact
// back immediately. When meeting_id is provided the result is also persisted on
// the sales_meetings doc.
//
// Body: { transcript, kind: 'digest'|'prd'|'sop', meeting_id?, company?,
//         sales_stage?, project_name? }

const VOICE = `VOICE: Direct. No hedging. Write for operators and owners, not tech people. Real numbers and specifics, never abstractions. Short blunt sentences. Never use em dashes (use a period or restructure). Never write "leverage", "optimize", "synergy", "streamline", "robust", "seamless". Do not hype "AI" — say "the system" or "a digital worker".`;

const PROMPTS = {
  digest: (ctx) => `You are the senior sales operations analyst at TMI. You read a recorded sales-call transcript and extract durable knowledge about the prospect's company so the team never loses what was learned. ${VOICE}

Company: ${ctx.company || 'Unknown'}
Stated sales stage: ${ctx.sales_stage || 'Unknown'}

Return ONLY valid JSON (no markdown), exactly this shape:
{
  "summary": "3-4 sentence recap of the call",
  "company_facts": ["durable facts about how this company operates, its size, tools, structure"],
  "pains": ["specific operational pains they named"],
  "current_systems": ["tools, software, or manual processes they use today"],
  "objections": ["concerns or objections raised"],
  "buying_signals": ["signals they are ready to move, in their own words where possible"],
  "stakeholders": [{"name": "name or role", "role": "their role / influence on the decision"}],
  "stage_read": "one blunt sentence on where this deal actually is and why",
  "next_steps": [{"action": "concrete next step", "owner": "TMI or prospect name"}]
}
Use empty arrays for anything not present. Never invent facts or numbers that were not said.`,

  prd: (ctx) => `You are a senior product manager at TMI. Based on this sales-call transcript for "${ctx.project_name || ctx.company || 'Untitled'}", write the PRD for the operating system TMI would build this company. ${VOICE}

Return ONLY valid JSON (no markdown), exactly these keys:
{
  "overview": "1-2 sentence overview of what to build",
  "problem": "who has this problem and what it costs them, grounded in what they said",
  "goals": "goals and success metrics, specific and measurable where possible",
  "stories": "user stories, one per line: As a [role], I want [feature] so that [benefit]",
  "requirements": "numbered list of functional requirements",
  "nonfunc": "non-functional requirements (performance, reliability, access, integrations)",
  "outofscope": "what is explicitly NOT included",
  "tech": "technical notes: systems to connect, data sources, digital workers to build",
  "criteria": "acceptance criteria — how we know each major piece is done"
}`,

  sop: (ctx) => `You are an operations lead at TMI. Based on this sales-call transcript for ${ctx.company || 'this company'}, write a clear standard operating procedure (SOP) for the single highest-leverage process discussed. ${VOICE}

Return ONLY valid JSON (no markdown), exactly these keys:
{
  "title": "name of the procedure",
  "purpose": "why this SOP exists and what it guarantees",
  "scope": "where this applies and where it does not",
  "roles": ["who is responsible for what"],
  "tools": ["systems or digital workers involved"],
  "steps": ["ordered, concrete steps — each a full instruction"],
  "cadence": "how often / when this runs",
  "kpis": ["how success is measured"]
}`,
};

async function callClaude(system, user, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured in Vercel env');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error?.message || `Claude API ${r.status}`);
  }
  const data = await r.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Could not parse JSON from Claude');
  return JSON.parse(text.slice(start, end + 1));
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body || {};
  const kind = b.kind || 'digest';
  if (!PROMPTS[kind]) return res.status(400).json({ error: 'kind must be digest, prd, or sop' });

  let transcript = b.transcript;
  const ctx = { company: b.company, sales_stage: b.sales_stage, project_name: b.project_name };
  let auditId = b.audit_id || null;

  // If only a meeting_id is supplied, pull the stored transcript + context.
  if (b.meeting_id) {
    const m = await db.getById('sales_meetings', b.meeting_id);
    if (!m) return res.status(404).json({ error: 'meeting not found' });
    if (!transcript || transcript.length < 10) transcript = m.transcript;
    ctx.company = ctx.company || m.company;
    ctx.sales_stage = ctx.sales_stage || m.sales_stage;
    ctx.project_name = ctx.project_name || m.title;
    auditId = auditId || m.audit_id || null;
  }
  if (!transcript || transcript.length < 10) {
    return res.status(400).json({ error: 'transcript required' });
  }

  // Ground the artifact in the paid Complete Audit when this call is attached to
  // one, so the PRD/digest reflects both the conversation and the audit findings.
  let auditContext = '';
  if (auditId) {
    try {
      const sub = await db.getById('audit_submissions', auditId);
      if (sub && sub.deliverable) {
        ctx.company = ctx.company || sub.company;
        auditContext = `\n\nPAID COMPLETE AUDIT (already delivered to this client; treat it as ground truth alongside the call):\n\n${String(sub.deliverable).slice(0, 7000)}`;
      }
    } catch (e) { /* best effort */ }
  }

  const system = PROMPTS[kind](ctx);
  const user = `Transcript:\n\n${transcript}${auditContext}`;

  let result;
  try {
    result = await callClaude(system, user, kind === 'digest' ? 2200 : 4096);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  // Persist onto the meeting when one is referenced.
  let followups_created = 0;
  if (b.meeting_id) {
    try {
      const patch =
        kind === 'digest' ? { summary: result.summary || null, knowledge: result, processed_at: new Date().toISOString() }
        : kind === 'prd'  ? { prd: result }
        :                   { sop: result };
      await db.update('sales_meetings', b.meeting_id, patch);
    } catch (e) {
      // Generation succeeded; surface the artifact even if the write hiccups.
      return res.status(200).json({ ok: true, kind, result, saved: false, save_error: e.message });
    }

    // A PRD for an audit call auto-refreshes the build proposal (as a draft) so
    // the three priced paths reflect the PRD. Fire-and-forget so the PRD response
    // is not held up by a second Claude call; the strategist sends it from admin.
    if (kind === 'prd' && auditId) {
      const subId = auditId, prdResult = result;
      (async () => {
        try {
          const { generateProposal } = require('./_proposal-gen');
          await generateProposal({ submissionId: subId, prd: prdResult, send: false });
        } catch (e) { console.error('auto proposal from prd:', e.message); }
      })();
    }

    // Auto-create follow-up tasks from a digest's next steps — once per meeting.
    if (kind === 'digest' && Array.isArray(result.next_steps) && result.next_steps.length) {
      try {
        const meeting = await db.getById('sales_meetings', b.meeting_id);
        if (meeting && !meeting.followups_created && (meeting.lead_id || meeting.client_id)) {
          const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // +2 days
          for (const s of result.next_steps) {
            const title = (typeof s === 'object' ? s.action : s) || '';
            if (!title) continue;
            await db.insert('followups', {
              lead_id: meeting.lead_id || null,
              client_id: meeting.client_id || null,
              contact_id: meeting.contact_id || null,
              type: 'task',
              title,
              notes: `From meeting: ${meeting.title || 'Sales call'}${s && s.owner ? ` · owner: ${s.owner}` : ''}`,
              due_at: due,
              priority: 'normal',
              completed: false,
            });
            followups_created++;
          }
          await db.update('sales_meetings', b.meeting_id, { followups_created: true });
        }
      } catch (_) { /* best-effort; never fail the digest over follow-ups */ }
    }
  }

  return res.status(200).json({ ok: true, kind, result, saved: !!b.meeting_id, followups_created });
};

// Complete Audit deliverable — the detailed audit a paying client receives after
// the intake, and the spine of the 30-minute discovery call. Generated from their
// own answers, diagnostic and specific, ending in DIY / DWY / DFY paths.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function buildCompleteAudit({ company, industry, answers = {} }) {
  const lines = Object.entries(answers)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: `You are TMI's senior operations strategist writing a paid Complete Audit for ${company || 'a client'}. The client paid $1,000 and answered a detailed intake. This deliverable must feel worth far more than that, and it is the document the founder and a TMI strategist walk through on a 30-minute call.

TMI runs a Delete / Connect / Build transformation: delete the software they don't use, connect what's left, build the backend the company runs on, with digital employees and a command center they run from their phone.

You diagnose every operation through three lenses, named by what is actually happening here:
1. Founder bottleneck - decisions, approvals, follow-up, knowledge route through one person.
2. Information bottleneck - status, numbers, history live in heads, texts, disconnected tools.
3. Operational latency - lag between stages (lead to response, job done to invoice, decision waiting on a person).

Rules: Use THEIR answers, quote their own words where it sharpens the point. Be specific to their niche and the real tools/numbers they gave. Concrete, not generic. No AI hype. No em dashes. Return clean, well-structured markdown a non-technical owner can read.`,
    messages: [{
      role: 'user',
      content: `Write the Complete Audit for ${company || 'this company'} (${industry || 'industry from their answers'}).

THEIR INTAKE ANSWERS:
${lines || '(answers attached)'}

Use exactly these sections:

# Complete Audit — ${company || ''}

## 1. Executive summary
3-5 sentences: where this operation is today and the single biggest constraint.

## 2. How your operation runs today
A clear, honest picture built from their answers - the flow from lead to delivered to paid, the tools, the team, the founder's role.

## 3. Where time and money are leaking
The specific bottlenecks, mapped to founder / information / latency. Tie each to what they told you. Where possible, estimate the cost (hours/week, dollars) using their numbers.

## 4. Your Intelligence Score
A 0-100 score with a one-line rationale, plus category scores (Lead flow, Operations, Visibility, Automation, Reporting) out of 10.

## 5. The intelligent version of this company
What it looks like when it runs on systems: the command center, the digital employees, what the founder stops doing.

## 6. The 90-day plan
### Phase 1 - Delete (days 1-30)
### Phase 2 - Connect (days 31-60)
### Phase 3 - Build (days 61-90)
Name the real tools to cut, what to connect, the systems to build for their niche.

## 7. Your three paths
- **DIY** - we hand you this plan, the system design, and the playbook; your team builds it.
- **DWY (Done With You)** - we build it alongside your team, you own it as we go.
- **DFY (Done For You)** - we build and run it for you; you just operate.
For each, one honest line on who it fits.

## 8. What to bring to the call
3-5 specific things to think about before the 30-minute strategy session, so we go deep fast.`,
    }],
  });

  return msg.content[0].text;
}

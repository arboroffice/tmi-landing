// Proposal / scope draft generator — an internal closing tool. After a discovery
// call, drafts the build proposal that scopes the Intelligent Company OS for this
// company, built from the stored audit so the team can send it fast. Not a priced
// standalone deliverable; it moves them to the build engagement.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function buildBlueprint({ companyName, industry, audit = {}, research = {} }) {
  const ctx = `
COMPANY: ${companyName}
INDUSTRY: ${industry || 'operations-heavy business'}
INTELLIGENCE SCORE: ${audit.score ?? 'n/a'}/100
PRIMARY BOTTLENECK: ${research.primaryPain || audit.summary || 'manual, disconnected operations'}
BOTTLENECKS: ${(audit.bottlenecks || []).join(', ')}
CURRENT STATE: ${(audit.current || []).join(', ')}
TARGET STATE: ${(audit.future || []).join(', ')}
DETECTED TECH STACK: ${(research.techStack || []).join(', ') || 'unknown'}
HIRING SIGNALS: ${(research.signals || []).join(', ') || 'none'}
POTENTIAL SAVINGS: ${audit.savingsAnnual ? '$' + Number(audit.savingsAnnual).toLocaleString() + '/yr' : 'n/a'}
HOURS RECOVERABLE: ${audit.hoursPerWeek ? audit.hoursPerWeek + ' hrs/week' : 'n/a'}
`.trim();

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2400,
    system: `You are TMI's solutions architect writing a draft build proposal for a prospect after a discovery call. It scopes the Intelligent Company OS build for THIS company. TMI runs a 30-day Delete / Connect / Build transformation: delete software they don't use, connect what's left, build the backend the company runs on, with digital employees and a command center they run from their phone. Be specific to their niche, their detected tools, and their real bottleneck. This is the document that wins the build engagement, grounded and concrete, not a generic sales deck. No AI hype. No em dashes. Return clean markdown.`,
    messages: [{
      role: 'user',
      content: `Write the Operational Blueprint for this company.

${ctx}

Use exactly these sections:
## Executive Summary
## Where the operation is stuck today
## The 90-Day Plan
### Phase 1 - Delete (days 1-10)
### Phase 2 - Connect (days 11-20)
### Phase 3 - Build (days 21-30)
## Systems we will build
## What changes (time and money)
## Scope and next step

Be concrete: name the real tools to cut, what to connect, the systems to build for their niche, and the digital employees that replace the manual work. Reference their bottleneck and signals. End with the build engagement and the next step (kickoff), not a separate paid artifact.`,
    }],
  });

  return msg.content[0].text;
}

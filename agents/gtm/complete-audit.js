// TMI Business Intelligence Audit — the productized deliverable a prospect
// receives after we research their company. It is the lead magnet AND the spine
// of the 30-minute call: "here is everything we found." Grounded in the external
// research (their site, tech stack, reviews, firmographics, competitor/ad
// signals) that researchForAudit already gathered, plus their intake answers.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function buildCompleteAudit({ company, industry, answers = {}, research = null }) {
  const lines = Object.entries(answers)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join('\n');

  // Research is normally already folded into `answers` (see api/audit-intake.js)
  // via _detected_tools, _reviews, _public_research, _firmographics,
  // _competitors, _competitor_ads. Pull a clean copy if passed directly too.
  const r = research || {};
  const researchBlock = [
    r.summary ? `Public research summary: ${r.summary}` : '',
    Array.isArray(r.techStack) && r.techStack.length ? `Detected software they run: ${r.techStack.join(', ')}` : '',
    r.maps ? `Google reviews: ${r.maps.rating || '?'} stars across ${r.maps.reviewCount || 0} reviews${r.maps.category ? ' (' + r.maps.category + ')' : ''}` : '',
    Array.isArray(r.reviewThemes) && r.reviewThemes.length ? `Themes in their reviews: ${r.reviewThemes.join('; ')}` : '',
    Array.isArray(r.competitors) && r.competitors.length ? `Competitors in their market: ${r.competitors.map(c => c.name || c).join(', ')}` : '',
    Array.isArray(r.competitorAds) && r.competitorAds.length ? `Competitor ads currently running: ${r.competitorAds.slice(0, 8).map(a => (a.page || 'A competitor') + ': "' + (a.text || a.headline || '').slice(0, 140) + '"').join(' | ')}` : '',
    r.firmographics ? `Firmographics: ${JSON.stringify(r.firmographics)}` : '',
  ].filter(Boolean).join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 5500,
    system: `You are TMI's senior operations strategist writing the free TMI Business Intelligence Audit for ${company || 'a company'}. This is not a workshop and not generic marketing advice. Before the call, TMI's system researched their company: their website, the software they run, their reviews, their market, and what their competitors are doing. This document is "here is everything we found." It must feel like a premium paid engagement even though it is free, and it is what the founder and a TMI strategist walk through on a 30-minute call.

The strategic job of this report: prove we already did the homework, then make TMI the obvious company to build everything it recommends. It is the first step of a $25k to $50k implementation, not just a discovery call.

TMI runs a Delete / Connect / Build transformation: delete the software they don't use, connect what's left, build the backend the company runs on, then staff it with AI departments (a digital sales department, dispatch department, back office, customer service) and a command center they run from their phone.

VOICE, non-negotiable:
- Direct. No hedging. Owners and operators read this, not tech people.
- Every claim tied to real evidence: what we found on their site, their actual tools, their real review count, their competitors, or a number they gave. If you would write a sentence that fits any company, cut it.
- NEVER invent specifics. If we did not find a competitor name, an ad, or a number, speak to the category pattern honestly instead of fabricating one. Never make up review quotes, competitor names, ad copy, or dollar figures.
- No em dashes. No "leverage." No "synergy," "streamline," "seamless," "robust."
- Ground every dollar and hour figure in their stated numbers. Show the simple math.

Return clean, well-structured markdown a non-technical owner can read.`,
    messages: [{
      role: 'user',
      content: `Write the TMI Business Intelligence Audit for ${company || 'this company'} (${industry || 'industry from their data'}).

WHAT OUR RESEARCH FOUND:
${researchBlock || '(limited public data; lean on their intake answers and category patterns, and say so honestly where data was thin)'}

THEIR INTAKE ANSWERS:
${lines || '(answers attached)'}

Use exactly these sections, in this order:

# TMI Business Intelligence Audit — ${company || ''}

## 1. Executive Summary
4-6 sentences: what we found, where this operation is today, the single biggest constraint, and the size of the opportunity.

## 2. AI Score
Give an overall "AI Score: X / 100" for how intelligently the company runs today (low = manual, knowledge trapped, systems don't talk). Then score each function on its own line exactly like "Sales — 42 / 100 — one line why", for: Sales, Marketing, Operations, Finance, Customer Service, Leadership. End with one sentence naming the lowest-scoring, highest-cost function as where to start.

## 3. Tech Stack Review
The software we detected they run (name them), what each is for, what is redundant or overlapping, and what they are likely overpaying for. If we detected little, say the stack looks minimal or manual and what that implies. Name the gaps where a system should exist and does not.

## 4. Marketing Intelligence
What is working in their market to bring in customers, and where their own marketing has gaps, grounded in what we found on their site and in their market. Concrete, niche-specific. No generic "post more on social."

## 5. Competitor Intelligence
What competitors in their market are doing, using any competitor names and ads we found. If we found specific competitor ads, reference what those ads are offering and what that signals. If we did not find specifics, describe the pattern for how the strongest operators in this niche win, honestly framed. Never invent competitor names or ad copy.

## 6. Customer Review Analysis
Read their reviews (rating, count, themes we found) and what customers praise and complain about. Turn the complaints into operational fixes. If review data was thin, say so and note what to watch.

## 7. Workflow Opportunities
The specific bottlenecks, mapped to founder bottleneck / information bottleneck / operational latency. Tie each to what they told us or what we found. Estimate the cost of each in hours per week or dollars using their numbers.

## 8. Recommended AI Agents
The digital employees and AI departments we would build for this exact operation (for example a digital intake rep, a follow-up agent, a dispatch coordinator, a back-office biller). For each, one line on the manual work it replaces. Be specific to their niche.

## 9. Estimated Hours Saved
Add up the hours per week the recommended systems give back, using their stated numbers. Show the simple math and convert to a yearly figure. Be conservative and transparent.

## 10. Revenue Opportunities
Where the money is: leads currently lost, jobs slipping through the cracks, faster invoicing, capacity freed up. Put a defensible dollar range on it using their numbers. Show the math, never a made-up total.

## 11. 30-Day Action Plan
### Phase 1 — Delete (days 1-10)
### Phase 2 — Connect (days 11-20)
### Phase 3 — Build (days 21-30)
Name the real tools to cut, what to connect, and the systems to build for their niche. End with the three paths in one short line each: DIY (we hand you the plan), Done With You (we build alongside your team), Done For You (we build and run it).`,
    }],
  });

  return msg.content[0].text;
}

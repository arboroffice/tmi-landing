import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { findContact, getEmail, enrichCompany } from './tools/apollo.js';
import { researchCompany } from './tools/research.js';
import { extractDomain } from './tools/apify.js';
import { sendDigest } from './tools/email.js';

const anthropic = new Anthropic();

// Fetch a company website for context
async function fetchWebsite(url) {
  if (!url) return null;
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TMI-Research/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3500);
  } catch {
    return null;
  }
}

// ── Build the briefing doc ─────────────────────────────────────────────────

async function buildBriefing({ company, contact, website, painResearch }) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    system: `You prepare pre-call briefing docs for TMI Technology's audit sessions.
TMI builds AI operating systems for trade and field service businesses.
The briefing is read by the TMI team right before an audit call, so it should be
practical, specific, and tactical. Help them walk in knowing exactly what to say.
No fluff. No generic advice. No em dashes.`,
    messages: [{
      role: 'user',
      content: `Build a pre-call briefing for an upcoming TMI audit session.

COMPANY: ${company.name}
INDUSTRY: ${company.industry || 'unknown'}
SIZE: ${company.employeeCount || 'unknown'} employees, ${company.revenue || 'unknown'} revenue
LOCATION: ${company.location || 'unknown'}
CONTACT: ${contact?.name || 'unknown'}, ${contact?.title || 'unknown'}

WEBSITE CONTENT:
${website || 'Not available'}

LIKELY PAIN POINTS (from research):
${painResearch?.likelyPainPoints?.join('\n') || 'Standard trade business operational challenges'}

Produce a briefing with these sections in markdown:

## Company Snapshot
3-4 bullet points: what they do, how big, where, any notable details.

## Likely Operational Pain
The specific operational problems this company probably has based on size and industry. Be concrete - dispatch, invoicing, compliance, crew coordination, field documentation.

## Discovery Questions
5 sharp questions to ask on the call that will surface the highest-leverage problem. Make them specific to this company.

## Recommended TMI Path
Everyone enters through the $1,000 Complete Audit. Based on what we know, which of the three paths should we likely steer them toward on the call: DIY (they build with our guidance), done with you (we build alongside their team), or done for you (we build and install it, $5k-$25k+, full department builds from ~$25k, plus an optional AI Department Retainer at $3k-$15k+/mo)? Why.

## Talk Track
2-3 sentences on how to open the call and the angle that will resonate with this specific operator.`
    }]
  });

  return message.content[0].text;
}

// ── Main audit prep handler ────────────────────────────────────────────────

export async function prepAudit({ companyName, contactName, contactEmail, website, leadId }) {
  console.log(`Preparing audit brief for: ${companyName}`);

  // Enrich what we know
  const domain = website ? extractDomain(website) : null;
  let apolloCompany = null;
  let contact = { name: contactName, email: contactEmail };

  if (domain) {
    try {
      [apolloCompany] = await Promise.all([
        enrichCompany({ domain }),
      ]);
      if (!contactName) {
        const found = await findContact({ domain, targetTitles: ['Owner', 'CEO', 'President', 'Founder'] });
        if (found) contact = found;
      }
    } catch (err) {
      console.warn(`Apollo enrich failed: ${err.message}`);
    }
  }

  const company = {
    name: apolloCompany?.name || companyName,
    industry: apolloCompany?.industry,
    employeeCount: apolloCompany?.employeeCount,
    revenue: apolloCompany?.revenue,
    location: apolloCompany?.location,
  };

  // Research the company
  const websiteContent = await fetchWebsite(website || apolloCompany?.website);
  const painResearch = await researchCompany({
    name: company.name,
    website: website || apolloCompany?.website,
    industry: company.industry,
    location: company.location,
    employeeCount: company.employeeCount,
  }).catch(() => null);

  // Build the briefing
  const briefing = await buildBriefing({ company, contact, website: websiteContent, painResearch });

  // Save to DB
  await db.insertAuditBrief({
    lead_id: leadId || null,
    company_name: company.name,
    contact_name: contact.name || contactName,
    briefing,
  });

  // Email the briefing to the team
  await sendDigest({
    subject: `Audit Brief: ${company.name}`,
    body: [
      `AUDIT PREP BRIEFING`,
      `Company: ${company.name}`,
      `Contact: ${contact.name || contactName || 'unknown'}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      '═══════════════════════════════════',
      '',
      briefing,
    ].join('\n'),
  }).catch(e => console.error('Digest error:', e.message));

  console.log(`Briefing generated for ${company.name}`);
  return { company: company.name, briefing };
}

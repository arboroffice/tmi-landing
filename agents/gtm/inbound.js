import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { findContact, getEmail, enrichCompany } from './tools/apollo.js';
import { extractDomain } from './tools/apify.js';
import { sendEmail, sendDigest } from './tools/email.js';
import { VOICE_SYSTEM } from './prompts/voice.js';

const anthropic = new Anthropic();

// ── Score a lead from the chat conversation ────────────────────────────────

async function scoreInboundLead({ messages, routeTag }) {
  const conversation = messages
    .map(m => `${m.role === 'user' ? 'Prospect' : 'TMI'}: ${m.content}`)
    .join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Extract info and score this chat conversation with a TMI prospect.

Route tag: ${routeTag}
Conversation:
${conversation.slice(0, 2000)}

Return JSON only:
{
  "companyName": "or null",
  "industry": "or null",
  "size": "estimated size or null",
  "ownerName": "first name if mentioned or null",
  "primaryPain": "the main problem they described in one sentence",
  "score": "hot|warm|cold",
  "scoreReason": "one sentence why",
  "urgency": "high|medium|low"
}`
    }]
  });

  try {
    const json = message.content[0].text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// ── Write a personalized inbound follow-up ────────────────────────────────

async function writeInboundFollowup({ lead, scoring, routeTag }) {
  const routeContext = {
    audit: 'Move them to the free Complete Audit at /complete-audit - a detailed operational audit plus a 30-minute strategy call with the founder and a strategist, where they map the three paths (DIY, done with you, done for you). It is free with no pitch, and it is the one entry point for everyone.',
  };
  // Single funnel: every inbound route leads to the Complete Audit.
  const routeNote = routeContext[routeTag] || routeContext.audit;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: VOICE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Write a personalized follow-up email for someone who just finished a TMI chat session.

What they shared:
- Company: ${lead.company_name || 'unknown'}
- Industry: ${lead.industry || 'unknown'}
- Size: ${scoring?.size || 'unknown'}
- Primary pain: ${scoring?.primaryPain || 'operational challenges'}
- Route: ${routeTag}

Next step: ${routeNote}

This is a warm follow-up - they already had a conversation with TMI. Be direct and specific.
Reference something they shared. Move them to the Complete Audit as the next step.

Return JSON: {"subject": "...", "body": "plain text"}`
    }]
  });

  try {
    const json = message.content[0].text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// ── Main inbound handler ───────────────────────────────────────────────────

export async function handleInboundLead({ messages, routeTag, prospectEmail }) {
  // Score the conversation
  const scoring = await scoreInboundLead({ messages, routeTag });
  console.log(`Inbound lead scored: ${scoring?.score} - ${scoring?.primaryPain}`);

  // Try to find their email if not provided
  let email = prospectEmail;
  let contact = null;
  let apolloCompany = null;

  if (scoring?.companyName) {
    const guessedDomain = scoring.companyName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+(inc|llc|co|corp|company|services|group)$/i, '')
      .trim()
      .replace(/\s+/g, '') + '.com';

    try {
      [contact, apolloCompany] = await Promise.all([
        findContact({ domain: guessedDomain, targetTitles: ['Owner', 'CEO', 'President', 'Founder'] }),
        enrichCompany({ domain: guessedDomain }),
      ]);
      if (contact && !contact.email && contact.apolloId) {
        contact.email = await getEmail({ apolloId: contact.apolloId }).catch(() => null);
      }
      email = email || contact?.email;
    } catch {
      // Apollo lookup failed - that's ok, we still have the conversation data
    }
  }

  // Save to DB
  let leadId;
  const leadData = {
    company_name: scoring?.companyName || apolloCompany?.name || 'Unknown (from chat)',
    industry: scoring?.industry || apolloCompany?.industry || null,
    location: apolloCompany?.location || null,
    employee_count: apolloCompany?.employeeCount?.toString() || null,
    owner_name: scoring?.ownerName || contact?.name || null,
    owner_title: contact?.title || null,
    email: email || null,
    linkedin_url: contact?.linkedinUrl || null,
    source: 'inbound_chat',
    status: email ? 'new' : 'no_email',
    score: scoring?.score || 'warm',
    route_tag: routeTag,
    research_notes: scoring?.primaryPain || null,
    pain_points: scoring?.primaryPain || null,
  };

  if (email) {
    // Get-or-create keyed by email; merge new signal info on hit.
    const saved = await db.upsertLeadByEmail(email, {
      route_tag: routeTag,
      score: scoring?.score || 'warm',
      research_notes: scoring?.primaryPain,
      status: 'new',
    });
    // If it was a fresh insert, backfill the rest of the lead data.
    if (saved && !saved.company_name) {
      await db.updateLead(saved.id, leadData);
    }
    leadId = saved?.id;
  } else {
    const saved = await db.insertLead(leadData);
    leadId = saved?.id;
  }

  // Send follow-up if we have an email
  if (email && scoring?.score !== 'cold') {
    const emailCopy = await writeInboundFollowup({
      lead: leadData,
      scoring,
      routeTag,
    });

    if (emailCopy) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_OUTREACH_API_KEY || process.env.RESEND_API_KEY);
      const { data: sent } = await resend.emails.send({
        from: `TMI <${process.env.OUTREACH_FROM_EMAIL}>`,
        reply_to: process.env.OUTREACH_REPLY_TO,
        to: email,
        subject: emailCopy.subject,
        text: emailCopy.body,
        tags: [{ name: 'type', value: 'inbound_followup' }],
      }).catch(e => ({ data: null, error: e }));

      if (sent?.id && leadId) {
        await db.logOutreach({
          leadId,
          step: 'inbound_response',
          subject: emailCopy.subject,
          body: emailCopy.body,
          resendMessageId: sent.id,
        });
        await db.updateLead(leadId, {
          status: 'sent',
          outreach_count: 1,
          first_contact_at: new Date().toISOString(),
          last_contact_at: new Date().toISOString(),
          next_followup_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        });

        console.log(`Sent inbound follow-up to ${email}`);
      }
    }
  }

  // Notify immediately for hot leads
  if (scoring?.score === 'hot') {
    await sendDigest({
      subject: `HOT INBOUND: ${leadData.company_name} - ${routeTag}`,
      body: [
        `HOT INBOUND LEAD`,
        `Company: ${leadData.company_name}`,
        `Industry: ${leadData.industry || 'unknown'}`,
        `Email: ${email || 'not found'}`,
        `Route: ${routeTag}`,
        `Pain: ${scoring.primaryPain}`,
        `Score reason: ${scoring.scoreReason}`,
        '',
        'Follow-up email sent automatically.',
        'View at: https://tmi-technology.com/admin',
      ].join('\n'),
    }).catch(() => {});
  }

  return { leadId, score: scoring?.score, email };
}

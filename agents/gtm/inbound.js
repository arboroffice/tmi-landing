import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { findContact, getEmail, enrichCompany } from './tools/apollo.js';
import { extractDomain } from './tools/apify.js';
import { sendEmail, sendDigest } from './tools/email.js';
import { VOICE_SYSTEM } from './prompts/voice.js';

const anthropic = new Anthropic();

function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

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
    foundation: 'They want to get started with AI basics. Recommend the Foundation Setup ($2,500).',
    audit: 'They want a diagnosis. Recommend The Audit ($997) - one session to map their operation.',
    build: 'They have a specific build in mind. Route to The Audit first, then Focused Build.',
    marketplace: 'They want pre-built systems. Route to the marketplace and offer a free assessment.',
    'vertical-founder': 'They want to build their own AI company. Route to the DWY or Vertical Founder conversation.',
  };

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

Route context: ${routeContext[routeTag] || 'General inquiry'}

This is a warm follow-up - they already had a conversation with TMI. Be direct and specific.
Reference something they shared. Move them to the next step.

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
  const supabase = db();

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
    // Check if already exists
    const { data: existing } = await supabase.from('leads').select('id').eq('email', email).single();
    if (existing) {
      await supabase.from('leads').update({
        route_tag: routeTag,
        score: scoring?.score || 'warm',
        research_notes: scoring?.primaryPain,
        status: 'new',
      }).eq('id', existing.id);
      leadId = existing.id;
    } else {
      const { data } = await supabase.from('leads').insert(leadData).select().single();
      leadId = data?.id;
    }
  } else {
    const { data } = await supabase.from('leads').insert(leadData).select().single();
    leadId = data?.id;
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
        await supabase.from('outreach').insert({
          lead_id: leadId,
          sequence_step: 'inbound_response',
          subject: emailCopy.subject,
          body: emailCopy.body,
          resend_message_id: sent.id,
        });
        await supabase.from('leads').update({
          status: 'sent',
          outreach_count: 1,
          first_contact_at: new Date().toISOString(),
          last_contact_at: new Date().toISOString(),
          next_followup_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        }).eq('id', leadId);

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

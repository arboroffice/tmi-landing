import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { sendEmail } from './tools/email.js';
import { researchCompany } from './tools/research.js';
import { VOICE_SYSTEM, FOLLOWUP_1_SYSTEM, FOLLOWUP_2_SYSTEM, BREAKUP_SYSTEM } from './prompts/voice.js';
import { LIMITS } from './config.js';

const anthropic = new Anthropic();

// ── Email generation ───────────────────────────────────────────────────────

async function generateEmail({ lead, research, systemPrompt, sequenceStep }) {
  const context = `
Company: ${lead.company_name}
Industry: ${lead.industry || 'trades/field service'}
Location: ${lead.location || 'unknown'}
Website: ${lead.website || 'unknown'}
Decision-maker: ${lead.owner_name || 'the owner'}
Title: ${lead.owner_title || 'Owner/Operator'}
Employee count: ${lead.employee_count || 'unknown'}
Estimated crew count: ${research?.crewCount || 'unknown'}

Primary pain point: ${research?.primaryPain || 'operational chaos from manual processes'}
All pain points: ${research?.likelyPainPoints?.join(', ') || 'dispatch, invoicing, compliance'}

Previous outreach count: ${lead.outreach_count}
Sequence step: ${sequenceStep}
`.trim();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Write a cold outreach email for this lead. Return JSON only with keys "subject" and "body". The body should be plain text with line breaks between paragraphs.

${context}`,
    }],
  });

  const raw = message.content[0].text;
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('No JSON in email generation response');
  return JSON.parse(json);
}

// ── Sequence step logic ────────────────────────────────────────────────────

function getSequenceStep(outreachCount) {
  if (outreachCount === 0) return { step: 'cold', system: VOICE_SYSTEM };
  if (outreachCount === 1) return { step: 'followup_1', system: FOLLOWUP_1_SYSTEM };
  if (outreachCount === 2) return { step: 'followup_2', system: FOLLOWUP_2_SYSTEM };
  if (outreachCount === 3) return { step: 'breakup', system: BREAKUP_SYSTEM };
  return null;
}

function getNextFollowupDate(step) {
  const days = { cold: 3, followup_1: 7, followup_2: 14, breakup: null };
  const d = days[step];
  if (!d) return null;
  const date = new Date();
  date.setDate(date.getDate() + d);
  return date.toISOString();
}

// ── Per-lead pipeline ──────────────────────────────────────────────────────

export async function processLead(lead) {
  const seq = getSequenceStep(lead.outreach_count);
  if (!seq) {
    // Sequence complete - mark as done
    await db.updateLead(lead.id, { status: 'sequence_complete' });
    return { skipped: true, reason: 'sequence_complete' };
  }

  if (!lead.email) {
    await db.updateLead(lead.id, { status: 'not_fit', research_notes: 'No email found' });
    return { skipped: true, reason: 'no_email' };
  }

  // Research (only on cold email, reuse notes for follow-ups)
  let research = null;
  if (seq.step === 'cold') {
    research = await researchCompany({
      name: lead.company_name,
      website: lead.website,
      industry: lead.industry,
      location: lead.location,
      employeeCount: lead.employee_count,
      reviewCount: null,
    });

    if (research && !research.goodFit) {
      await db.updateLead(lead.id, {
        status: 'not_fit',
        research_notes: research.fitReason,
      });
      return { skipped: true, reason: 'not_fit', note: research.fitReason };
    }

    if (research) {
      await db.updateLead(lead.id, {
        research_notes: research.primaryPain,
        pain_points: research.likelyPainPoints?.join(', '),
      });
    }
  } else {
    // Parse stored research for follow-ups
    research = {
      primaryPain: lead.research_notes,
      likelyPainPoints: lead.pain_points?.split(', ') || [],
      crewCount: null,
    };
  }

  // Generate email
  const { subject, body } = await generateEmail({
    lead,
    research,
    systemPrompt: seq.system,
    sequenceStep: seq.step,
  });

  // Send
  const messageId = await sendEmail({
    to: lead.email,
    toName: lead.owner_name || undefined,
    subject,
    body,
  });

  // Log outreach
  await db.logOutreach({
    leadId: lead.id,
    step: seq.step,
    subject,
    body,
    resendMessageId: messageId,
  });

  // Update lead
  const now = new Date().toISOString();
  const nextFollowup = getNextFollowupDate(seq.step);
  await db.updateLead(lead.id, {
    status: seq.step === 'breakup' ? 'sequence_complete' : 'sent',
    outreach_count: (lead.outreach_count || 0) + 1,
    first_contact_at: lead.first_contact_at || now,
    last_contact_at: now,
    next_followup_at: nextFollowup,
  });

  console.log(`  Sent ${seq.step} to ${lead.owner_name || lead.company_name} <${lead.email}>`);
  return { sent: true, step: seq.step, email: lead.email };
}

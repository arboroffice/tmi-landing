import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { sendEmail } from './tools/email.js';
import { researchCompany } from './tools/research.js';
import { buildAuditData } from './audit-build.js';
import { writeAuditPage } from './audit-site.js';
import { writeCardPng } from './audit-card.js';
import { VOICE_SYSTEM, FOLLOWUP_1_SYSTEM, FOLLOWUP_2_SYSTEM, BREAKUP_SYSTEM } from './prompts/voice.js';
import { LIMITS } from './config.js';

const anthropic = new Anthropic();

// ── Email generation ───────────────────────────────────────────────────────

async function generateEmail({ lead, research, systemPrompt, sequenceStep, auditUrl }) {
  const context = `
Company: ${lead.company_name}
Industry: ${lead.industry || 'operations-heavy business'}
Location: ${lead.location || 'unknown'}
Website: ${lead.website || 'unknown'}
Decision-maker: ${lead.owner_name || 'the owner'}
Title: ${lead.owner_title || 'Owner/Operator'}
Employee count: ${lead.employee_count || 'unknown'}

Primary pain point: ${research?.primaryPain || 'manual, disconnected operations'}
All pain points: ${research?.likelyPainPoints?.join(', ') || 'scheduling, dispatch, reporting'}

AUDIT LINK (include this exact URL on its own line in cold emails): ${auditUrl || lead.audit_url || '(none yet - reference the review without a link)'}

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

    // Build the personalized Intelligent Company Audit microsite (the BI-rep asset).
    try {
      const auditData = await buildAuditData({ lead, research });

      // Personalized executive card image (static PNG, host-agnostic).
      let cardImage = null;
      const provisionalSlug = (lead.company_name || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
      try {
        cardImage = await writeCardPng({
          slug: provisionalSlug,
          companyName: lead.company_name,
          score: auditData.score,
          industry: lead.industry,
        });
      } catch (e) {
        console.warn(`  Card image failed for ${lead.company_name}: ${e.message}`);
      }

      const out = writeAuditPage({
        ...auditData,
        companyName: lead.company_name,
        ownerFirstName: (lead.owner_name || '').split(' ')[0] || '',
        industry: lead.industry,
        revenueEst: lead.revenue_est || lead.revenue,
        employees: lead.employee_count,
        cardImage,
      });
      lead.audit_url = out.url;
      await db.updateLead(lead.id, {
        audit_url: out.url,
        audit_slug: out.slug,
        intel_score: auditData.score,
      });
      console.log(`  Audit built: ${out.url} (score ${auditData.score})`);
    } catch (err) {
      console.warn(`  Audit generation failed for ${lead.company_name}: ${err.message}`);
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
    auditUrl: lead.audit_url,
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

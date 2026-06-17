import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { sendEmail } from './tools/email.js';
import { researchCompany } from './tools/research.js';
import { buildAuditData } from './audit-build.js';
import { slugify } from './audit-site.js';
import { instantlyEnabled, addLeadToInstantly } from './tools/instantly.js';
import { VOICE_SYSTEM, FOLLOWUP_1_SYSTEM, FOLLOWUP_2_SYSTEM, FOLLOWUP_3_SYSTEM, PLAYBOOK_SYSTEM, BREAKUP_SYSTEM } from './prompts/voice.js';
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
  if (outreachCount === 3) return { step: 'followup_3', system: FOLLOWUP_3_SYSTEM };
  if (outreachCount === 4) return { step: 'playbook', system: PLAYBOOK_SYSTEM };
  if (outreachCount === 5) return { step: 'breakup', system: BREAKUP_SYSTEM };
  return null;
}

function getNextFollowupDate(step) {
  // days until the next step (relative to this send): 0,3,7,14,21,28 absolute
  const days = { cold: 3, followup_1: 4, followup_2: 7, followup_3: 7, playbook: 7, breakup: null };
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

  // Guardrail: never contact suppressed / do-not-contact addresses.
  if (await db.isSuppressed(lead.email).catch(() => false)) {
    await db.updateLead(lead.id, { status: 'suppressed', next_followup_at: null });
    return { skipped: true, reason: 'suppressed' };
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
      // Trigger prioritization: hiring signals (Dispatcher, Ops Coordinator…) = hot account.
      const priority = research.signals?.length ? 'high' : 'normal';
      await db.updateLead(lead.id, {
        research_notes: research.primaryPain,
        pain_points: research.likelyPainPoints?.join(', '),
        signals: (research.signals || []).join(', '),
        priority,
      });
    }

    // Build the personalized Intelligent Company Audit and store it in Firestore.
    // The microsite (/audit/<slug>) and card image render dynamically from this
    // record, so they are live the instant the lead is created - no deploy lag.
    try {
      const auditData = await buildAuditData({ lead, research });
      const slug = slugify(lead.company_name);
      await db.saveAudit(slug, {
        ...auditData,
        companyName: lead.company_name,
        ownerFirstName: (lead.owner_name || '').split(' ')[0] || '',
        industry: lead.industry || '',
        revenueEst: lead.revenue_est || lead.revenue || '',
        employees: lead.employee_count || '',
        leadId: lead.id,
      });
      lead.audit_url = `https://www.tmitechai.com/audit/${slug}`;
      lead.audit_card = `https://www.tmitechai.com/api/audit-card?slug=${slug}`;
      await db.updateLead(lead.id, {
        audit_url: lead.audit_url,
        audit_slug: slug,
        audit_card: lead.audit_card,
        intel_score: auditData.score,
      });
      console.log(`  Audit stored: ${lead.audit_url} (score ${auditData.score})`);
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

  // ── Dry run: everything except the send. The audit is built and stored so you
  // can review it; the lead is marked 'audited' and never contacted.
  if (String(process.env.GTM_DRY_RUN || '').toLowerCase() === 'true') {
    if (seq.step === 'cold') {
      await db.updateLead(lead.id, { status: 'audited', next_followup_at: null });
      console.log(`  [dry-run] audited, not sent: ${lead.company_name} (${lead.audit_url || 'no audit'})`);
      return { sent: false, dryRun: true, step: 'cold', email: lead.email };
    }
    return { skipped: true, reason: 'dry_run' };
  }

  // ── Instantly path: it owns sending + the sequence. We push the cold lead with
  // its personalized audit as custom variables; follow-ups happen inside Instantly.
  if (instantlyEnabled()) {
    if (seq.step !== 'cold') {
      await db.updateLead(lead.id, { next_followup_at: null });
      return { skipped: true, reason: 'instantly_owns_sequence' };
    }
    const nm = (lead.owner_name || '').trim().split(/\s+/);
    try {
      await addLeadToInstantly({
        email: lead.email,
        firstName: nm[0] || undefined,
        lastName: nm.length > 1 ? nm.slice(1).join(' ') : undefined,
        companyName: lead.company_name,
        variables: {
          audit_link: lead.audit_url || '',
          audit_card: lead.audit_card || '',
          intel_score: lead.intel_score != null ? String(lead.intel_score) : '',
          primary_bottleneck: research?.primaryPain || '',
          industry: lead.industry || '',
          location: lead.location || '',
        },
      });
    } catch (err) {
      console.error(`  Instantly push failed for ${lead.email}: ${err.message}`);
      return { skipped: true, reason: 'instantly_error', note: err.message };
    }
    const now = new Date().toISOString();
    await db.updateLead(lead.id, {
      status: 'in_campaign',
      outreach_count: 1,
      first_contact_at: lead.first_contact_at || now,
      last_contact_at: now,
      next_followup_at: null,
      sent_via: 'instantly',
    });
    console.log(`  Pushed to Instantly: ${lead.company_name} <${lead.email}>`);
    return { sent: true, step: 'cold', via: 'instantly', email: lead.email };
  }

  // ── Resend path (fallback when Instantly is not configured) ───────────────
  // Generate email
  const { subject, body } = await generateEmail({
    lead,
    research,
    systemPrompt: seq.system,
    sequenceStep: seq.step,
    auditUrl: lead.audit_url,
  });

  // Send (embed the personalized audit card on the cold email)
  const messageId = await sendEmail({
    to: lead.email,
    toName: lead.owner_name || undefined,
    subject,
    body,
    imageUrl: seq.step === 'cold' ? (lead.audit_card || null) : null,
    auditUrl: lead.audit_url || null,
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

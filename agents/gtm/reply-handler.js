import Anthropic from '@anthropic-ai/sdk';
import * as db from './tools/db.js';
import { sendEmail, sendDigest } from './tools/email.js';
import { VOICE_SYSTEM } from './prompts/voice.js';

const anthropic = new Anthropic();

// The one next step for an interested reply is the paid Complete Audit. Nobody
// books a call until the audit is paid for, so we never hand out a raw calendar.
const BOOKING_URL = process.env.AUDIT_LINK || 'https://www.tmitechai.com/complete-audit';
// Auto-send the drafted reply to the prospect when set; otherwise draft + notify the team.
const AUTO_REPLY = String(process.env.AUTO_REPLY || '').toLowerCase() === 'true';

// ── Classify the intent of a reply ──────────────────────────────────────────
async function classifyReply(replyBody) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 260,
    messages: [{
      role: 'user',
      content: `Classify this reply to a cold outreach email that linked a personalized operational audit. Return JSON only.

Reply:
${replyBody.slice(0, 1200)}

intent options:
- "interested" (positive, wants to learn more)
- "meeting_request" (explicitly wants to book/talk)
- "question" (asked something specific that needs answering)
- "not_now" (timing, circle back later)
- "not_interested"
- "wrong_person" (forward / not the right contact)
- "unsubscribe"
- "out_of_office" (auto-reply)

Return: {"intent": "...", "summary": "one sentence", "question": "the specific question if intent is question, else null", "urgency": "high"|"medium"|"low"}`
    }]
  });
  try {
    const json = message.content[0].text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : { intent: 'not_interested', summary: 'Unclear', question: null, urgency: 'low' };
  } catch {
    return { intent: 'not_interested', summary: 'Parse error', question: null, urgency: 'low' };
  }
}

// ── Draft a response (interested / meeting / question) ──────────────────────
async function draftReply({ lead, replyBody, classification }) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 450,
    system: VOICE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Write a short, warm reply to this prospect who responded to the personalized audit we sent. You are Mia from TMI.

Company: ${lead?.company_name || 'their company'}
Name: ${lead?.owner_name || 'there'}
Their audit preview: ${lead?.audit_url || '(audit link)'}
Complete Audit link: ${BOOKING_URL}
Their reply: ${replyBody.slice(0, 900)}
Intent: ${classification.intent}
${classification.question ? `Their question: ${classification.question}` : ''}

Rules:
- If they asked a question, answer it directly and briefly first.
- Reference something specific they said.
- Move them toward the free Complete Audit: a detailed operational audit plus a 30-minute strategy call with the founder and a strategist, free. Offer the Complete Audit link on its own line.
- If useful, point back to their audit preview link.
- Keep it under 90 words. Sign as Mia, TMI. No meeting-ask cliches, no hard sell.

Return JSON: {"subject": "Re: ...", "body": "plain text with line breaks"}`
    }]
  });
  try {
    const json = message.content[0].text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

const RESPOND_INTENTS = new Set(['interested', 'meeting_request', 'question']);

// ── Main handler ─────────────────────────────────────────────────────────────
export async function handleReply({ fromEmail, subject, body, inReplyToMessageId }) {
  const lead = await db.getLeadWithOutreach(fromEmail);
  const outreach = lead?.outreach?.find(o => o.resend_message_id === inReplyToMessageId) || lead?.outreach?.[0];

  const classification = await classifyReply(body);
  console.log(`Reply from ${fromEmail}: ${classification.intent} (${classification.summary})`);

  const updates = { reply_received: true, reply_at: new Date().toISOString() };
  let draft = null;
  let autoSent = false;

  switch (classification.intent) {
    case 'interested':
    case 'meeting_request':
    case 'question':
      updates.status = 'replied';
      updates.score = 'hot';
      updates.next_followup_at = null;
      draft = await draftReply({ lead, replyBody: body, classification });
      // Optionally send the reply autonomously.
      if (AUTO_REPLY && draft && lead?.email) {
        try {
          const mid = await sendEmail({ to: lead.email, toName: lead.owner_name || undefined, subject: draft.subject || `Re: ${subject}`, body: draft.body });
          autoSent = true;
          await db.logOutreach({ leadId: lead.id, step: 'reply', subject: draft.subject, body: draft.body, resendMessageId: mid });
        } catch (e) { console.error('Auto-reply send failed:', e.message); }
      }
      break;

    case 'not_now': {
      updates.status = 'not_now';
      const d = new Date(); d.setDate(d.getDate() + 60);
      updates.next_followup_at = d.toISOString();
      break;
    }
    case 'unsubscribe':
      updates.status = 'unsubscribed';
      updates.unsubscribed = true;
      updates.next_followup_at = null;
      await db.addSuppression({ email: fromEmail, reason: 'unsubscribe' }).catch(() => {});
      break;
    case 'wrong_person':
      updates.status = 'wrong_person';
      updates.next_followup_at = null;
      break;
    case 'out_of_office':
      updates.status = 'sent'; // leave the sequence running
      break;
    case 'not_interested':
    default:
      updates.status = 'not_interested';
      updates.next_followup_at = null;
  }

  if (lead) {
    await db.updateLead(lead.id, updates);
    await db.logReply({
      lead_id: lead.id,
      outreach_id: outreach?.id || null,
      from_email: fromEmail,
      subject,
      body: body.slice(0, 5000),
      intent: classification.intent,
      draft_response: draft?.body || null,
    });
  }

  // Notify the team on any reply worth a human eye.
  if (RESPOND_INTENTS.has(classification.intent)) {
    const digestBody = [
      `${autoSent ? 'REPLIED (auto)' : 'HOT REPLY'} - ${lead?.company_name || fromEmail}`,
      `From: ${fromEmail}`,
      `Intent: ${classification.intent} | ${classification.summary}`,
      lead?.audit_url ? `Audit: ${lead.audit_url}` : '',
      '',
      '--- Their message ---',
      body.slice(0, 900),
      '',
      autoSent ? '--- Sent reply ---' : '--- Suggested reply ---',
      draft?.body || '(no draft generated)',
      '',
      `Reply to: ${fromEmail}`,
    ].filter(Boolean).join('\n');

    await sendDigest({
      subject: `${autoSent ? 'Auto-replied' : 'HOT REPLY'}: ${lead?.company_name || fromEmail} (${classification.intent})`,
      body: digestBody,
    }).catch(e => console.error('Digest error:', e.message));
  }

  // Fast team SMS for the hottest replies so a human can jump in immediately
  // (the email digest above can sit unread). Only the money intents.
  if (classification.intent === 'interested' || classification.intent === 'meeting_request') {
    try {
      if (process.env.TWILIO_ACCOUNT_SID) {
        const twilio = (await import('twilio')).default;
        twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
          from: '+18557171044', to: '+13373809059',
          body: `${autoSent ? 'AUTO-REPLIED' : 'HOT'} cold reply (${classification.intent}): ${lead?.company_name || fromEmail} - ${classification.summary}`.slice(0, 320),
        }).catch(() => {});
      }
    } catch (e) { console.error('hot reply sms:', e.message); }
  }

  return { intent: classification.intent, leadId: lead?.id, autoSent };
}

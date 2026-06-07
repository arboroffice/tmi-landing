import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, sendDigest } from './tools/email.js';
import { VOICE_SYSTEM } from './prompts/voice.js';

const anthropic = new Anthropic();

function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// ── Classify the intent of a reply ────────────────────────────────────────

async function classifyReply(replyBody) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Classify the intent of this email reply to a cold outreach email. Return JSON only.

Reply:
${replyBody.slice(0, 1000)}

Return: {"intent": "interested"|"not_now"|"not_interested"|"wrong_person"|"unsubscribe"|"out_of_office", "summary": "one sentence", "urgency": "high"|"medium"|"low"}`
    }]
  });

  try {
    const json = message.content[0].text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : { intent: 'not_interested', summary: 'Unclear', urgency: 'low' };
  } catch {
    return { intent: 'not_interested', summary: 'Parse error', urgency: 'low' };
  }
}

// ── Draft a response for interested replies ────────────────────────────────

async function draftResponse({ lead, replyBody, classification }) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: VOICE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Draft a reply to this interested prospect. Short, warm, move them toward a 15-min call.

Company: ${lead.company_name}
Name: ${lead.owner_name || 'unknown'}
Their reply: ${replyBody.slice(0, 800)}
Classification: ${classification.summary}

Return JSON: {"subject": "Re: ...", "body": "plain text response"}`
    }]
  });

  try {
    const json = message.content[0].text.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function handleReply({ fromEmail, subject, body, inReplyToMessageId }) {
  const supabase = db();

  // Find the lead by email
  const { data: lead } = await supabase
    .from('leads')
    .select('*, outreach(*)')
    .eq('email', fromEmail)
    .single();

  // Find the specific outreach record by message ID
  const outreach = lead?.outreach?.find(o => o.resend_message_id === inReplyToMessageId)
    || lead?.outreach?.[0];

  // Classify intent
  const classification = await classifyReply(body);
  console.log(`Reply from ${fromEmail}: ${classification.intent} (${classification.summary})`);

  // Update lead status based on intent
  const updates = { reply_received: true, reply_at: new Date().toISOString() };

  let draftResponse = null;

  switch (classification.intent) {
    case 'interested':
      updates.status = 'replied';
      updates.score = 'hot';
      updates.next_followup_at = null;
      draftResponse = await draftResponse({ lead, replyBody: body, classification });
      break;

    case 'not_now':
      updates.status = 'not_now';
      // Schedule follow-up in 60 days
      const followupDate = new Date();
      followupDate.setDate(followupDate.getDate() + 60);
      updates.next_followup_at = followupDate.toISOString();
      break;

    case 'unsubscribe':
      updates.status = 'unsubscribed';
      updates.unsubscribed = true;
      updates.next_followup_at = null;
      break;

    case 'wrong_person':
      updates.status = 'wrong_person';
      updates.next_followup_at = null;
      break;

    case 'not_interested':
    case 'out_of_office':
    default:
      updates.status = classification.intent === 'out_of_office' ? 'sent' : 'not_interested';
      updates.next_followup_at = null;
  }

  if (lead) {
    await supabase.from('leads').update(updates).eq('id', lead.id);

    // Log reply to replies table
    await supabase.from('replies').insert({
      lead_id: lead.id,
      outreach_id: outreach?.id || null,
      from_email: fromEmail,
      subject,
      body: body.slice(0, 5000),
      intent: classification.intent,
      draft_response: draftResponse?.body || null,
    });
  }

  // Notify immediately for hot replies
  if (classification.intent === 'interested') {
    const digestBody = [
      `HOT REPLY - ${lead?.company_name || fromEmail}`,
      `From: ${fromEmail}`,
      `Summary: ${classification.summary}`,
      '',
      '--- Their message ---',
      body.slice(0, 800),
      '',
      '--- Suggested response ---',
      draftResponse?.body || '(no draft generated)',
      '',
      'Reply to: ' + fromEmail,
    ].join('\n');

    await sendDigest({
      subject: `HOT REPLY: ${lead?.company_name || fromEmail} is interested`,
      body: digestBody,
    }).catch(e => console.error('Digest error:', e.message));
  }

  return { intent: classification.intent, leadId: lead?.id };
}

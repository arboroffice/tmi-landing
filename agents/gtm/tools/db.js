import { createClient } from '@supabase/supabase-js';

let _client;
function client() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return _client;
}

// ── Leads ──────────────────────────────────────────────────────────────────

export async function leadExists(email) {
  const { data } = await client()
    .from('leads')
    .select('id')
    .eq('email', email)
    .single();
  return !!data;
}

export async function insertLead(lead) {
  const { data, error } = await client()
    .from('leads')
    .insert(lead)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLead(id, fields) {
  const { error } = await client()
    .from('leads')
    .update(fields)
    .eq('id', id);
  if (error) throw error;
}

// Leads that haven't been contacted yet
export async function getNewLeads(limit = 20) {
  const { data, error } = await client()
    .from('leads')
    .select('*')
    .eq('status', 'new')
    .not('email', 'is', null)
    .eq('unsubscribed', false)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Leads whose next_followup_at has passed
export async function getLeadsDueForFollowup() {
  const { data, error } = await client()
    .from('leads')
    .select('*')
    .lte('next_followup_at', new Date().toISOString())
    .eq('reply_received', false)
    .eq('unsubscribed', false)
    .in('status', ['sent'])
    .lt('outreach_count', 4);
  if (error) throw error;
  return data || [];
}

// Recent activity for the daily digest
export async function getDigestStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const db = client();

  const [newLeads, sent, replied] = await Promise.all([
    db.from('leads').select('id', { count: 'exact', head: true })
      .gte('created_at', since),
    db.from('outreach').select('id', { count: 'exact', head: true })
      .gte('sent_at', since),
    db.from('leads').select('id', { count: 'exact', head: true })
      .eq('reply_received', true).gte('reply_at', since),
  ]);

  return {
    newLeadsAdded: newLeads.count || 0,
    emailsSent: sent.count || 0,
    repliesReceived: replied.count || 0,
  };
}

// ── Outreach ───────────────────────────────────────────────────────────────

export async function logOutreach({ leadId, step, subject, body, resendMessageId }) {
  const { error } = await client()
    .from('outreach')
    .insert({
      lead_id: leadId,
      sequence_step: step,
      subject,
      body,
      resend_message_id: resendMessageId,
    });
  if (error) throw error;
}

export async function getOutreachHistory(leadId) {
  const { data, error } = await client()
    .from('outreach')
    .select('*')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

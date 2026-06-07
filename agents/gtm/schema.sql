-- Run this in Supabase SQL editor

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text,
  industry text,
  revenue_est text,
  employee_count text,
  location text,
  owner_name text,
  owner_title text,
  email text unique,
  linkedin_url text,
  phone text,
  source text,                  -- 'apify_maps' | 'apify_linkedin' | 'apollo' | 'inbound_chat' | 'manual'
  status text default 'new',   -- 'new' | 'researched' | 'sent' | 'replied' | 'qualified' | 'not_fit' | 'unsubscribed'
  score text,                   -- 'hot' | 'warm' | 'cold'
  route_tag text,               -- from chat widget: 'audit' | 'build' | 'foundation' etc.
  research_notes text,
  pain_points text,
  outreach_count integer default 0,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  next_followup_at timestamptz,
  reply_received boolean default false,
  reply_at timestamptz,
  unsubscribed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists outreach (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  sequence_step text not null,  -- 'cold' | 'followup_1' | 'followup_2' | 'breakup'
  subject text,
  body text,
  sent_at timestamptz default now(),
  resend_message_id text,
  opened boolean default false,
  clicked boolean default false,
  replied boolean default false
);

-- index for followup queries
create index if not exists leads_followup_idx on leads (status, next_followup_at)
  where unsubscribed = false and reply_received = false;

-- auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger leads_updated_at before update on leads
  for each row execute function update_updated_at();

-- Content queue: social posts waiting to be published
create table if not exists content_queue (
  id uuid primary key default gen_random_uuid(),
  source_article text,           -- filename of the article it came from
  platform text not null,        -- 'linkedin' | 'twitter' | 'newsletter'
  content text not null,
  status text default 'pending', -- 'pending' | 'published' | 'skipped'
  published_at timestamptz,
  created_at timestamptz default now()
);

-- Replies received from outreach
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  outreach_id uuid references outreach(id),
  from_email text,
  subject text,
  body text,
  intent text,                   -- 'interested' | 'not_now' | 'not_interested' | 'wrong_person' | 'unsubscribe'
  draft_response text,
  responded_at timestamptz,
  received_at timestamptz default now()
);

-- Audit prep briefings
create table if not exists audit_briefs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  company_name text,
  contact_name text,
  briefing text,
  created_at timestamptz default now()
);

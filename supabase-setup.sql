-- ============================================================================
-- TMI Admin — Complete Database Setup (single file)
-- ----------------------------------------------------------------------------
-- Run this once in the Supabase SQL Editor (Database -> SQL Editor -> New query)
-- of the project the admin should use. Safe to re-run: every statement is
-- idempotent (CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE).
--
-- Consolidates: supabase-schema.sql + email_sends + supabase-os-schema.sql
--               + supabase-city-leads.sql + supabase-audit-table.sql
-- Order matters (foreign keys): contacts first, then everything that refs it.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. CORE CRM
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text,
  email         text,
  phone         text,
  company       text,
  title         text,
  audience      text,
  niche         text,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete cascade,
  status        text default 'new',
  source        text,
  title         text,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete cascade,
  plan          text,
  status        text default 'active',
  mrr           numeric default 0,
  start_date    timestamptz,
  end_date      timestamptz,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  client_id     uuid references public.clients(id) on delete set null,
  type          text,
  title         text,
  body          text,
  created_at    timestamptz default now()
);

create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  status        text default 'new',
  name          text,
  email         text,
  phone         text,
  company       text,
  audience      text,
  niche         text,
  message       text,
  source        text,
  notes         text,
  contact_id    uuid references public.contacts(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  created_at    timestamptz default now()
);

create table if not exists public.followups (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  client_id     uuid references public.clients(id) on delete set null,
  type          text,
  title         text,
  notes         text,
  due_at        timestamptz,
  priority      text default 'normal',
  assigned_to   text,
  completed     boolean default false,
  completed_at  timestamptz,
  created_at    timestamptz default now()
);

create table if not exists public.proposals (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  title         text,
  status        text default 'draft',
  total         numeric,
  sections      jsonb,
  line_items    jsonb,
  expires_at    timestamptz,
  sent_at       timestamptz,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete set null,
  contact_id    uuid references public.contacts(id) on delete set null,
  name          text,
  status        text default 'scoping',
  start_date    timestamptz,
  end_date      timestamptz,
  value         numeric,
  description   text,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete set null,
  contact_id    uuid references public.contacts(id) on delete set null,
  number        text,
  amount        numeric default 0,
  status        text default 'unpaid',
  due_date      timestamptz,
  description   text,
  line_items    jsonb,
  notes         text,
  paid_at       timestamptz,
  created_at    timestamptz default now()
);

-- ── Comms ───────────────────────────────────────────────────────────────────
create table if not exists public.email_campaigns (
  id              uuid primary key default gen_random_uuid(),
  subject         text,
  body            text,
  from_name       text default 'TMI',
  from_email      text,
  reply_to        text,
  audience_type   text default 'all',
  audience_filter jsonb,
  status          text default 'draft',
  sent_at         timestamptz,
  created_at      timestamptz default now()
);

create table if not exists public.email_sends (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.email_campaigns(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete cascade,
  email        text not null,
  status       text default 'sent' check (status in ('sent','bounced','failed')),
  created_at   timestamptz default now()
);

create table if not exists public.sms_log (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete set null,
  direction     text,
  phone         text,
  body          text,
  status        text,
  twilio_sid    text,
  created_at    timestamptz default now()
);

-- ── Content ───────────────────────────────────────────────────────────────--
create table if not exists public.content_items (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  category      text,
  status        text default 'draft',
  publish_date  timestamptz,
  filename      text,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists public.content_ideas (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  hook          text,
  notes         text,
  world         text,
  territory     text,
  formats       jsonb,
  series        text,
  status        text default 'idea',
  platforms     jsonb,
  post_url      text,
  scheduled_at  timestamptz,
  posted_at     timestamptz,
  created_at    timestamptz default now()
);

create table if not exists public.content_posts (
  id            uuid primary key default gen_random_uuid(),
  idea_id       uuid references public.content_ideas(id) on delete set null,
  platform      text,
  format        text,
  content_body  text,
  image_url     text,
  status        text default 'scripted',
  scheduled_at  timestamptz,
  posted_at     timestamptz,
  notes         text,
  created_at    timestamptz default now()
);

-- ── Founders of the Future (FOTF) ────────────────────────────────────────────
create table if not exists public.fotf_members (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text,
  business_name   text,
  founder_number  serial,
  status          text default 'active',
  stage           text,
  updated_at      timestamptz default now(),
  created_at      timestamptz default now()
);

create table if not exists public.fotf_receipts (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid references public.fotf_members(id) on delete cascade,
  founder_number  integer,
  created_at      timestamptz default now()
);

create table if not exists public.fotf_stories (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references public.fotf_members(id) on delete cascade,
  story_text    text,
  submitted_at  timestamptz default now(),
  created_at    timestamptz default now()
);

create table if not exists public.fotf_sprints (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references public.fotf_members(id) on delete cascade,
  title         text,
  status        text default 'active',
  goal          text,
  start_date    timestamptz,
  end_date      timestamptz,
  created_at    timestamptz default now()
);

create table if not exists public.fotf_glass_box (
  id            uuid primary key default gen_random_uuid(),
  post_text     text,
  created_at    timestamptz default now()
);

create table if not exists public.fotf_issues (
  id                uuid primary key default gen_random_uuid(),
  status            text default 'draft',
  series            text,
  headline          text,
  dek               text,
  cold_open         text,
  setup             text,
  the_turn          text,
  the_proof         text,
  pull_quote        text,
  online_example    text,
  physical_example  text,
  next_step         text,
  scheduled_at      timestamptz,
  beehiiv_id        text,
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

create table if not exists public.fotf_library (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  category      text,
  audience      text,
  content       text,
  url           text,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);

create table if not exists public.fotf_rituals (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  frequency     text,
  type          text,
  description   text,
  scheduled_at  timestamptz,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);

create table if not exists public.fotf_stage_letters (
  id            uuid primary key default gen_random_uuid(),
  stage         text,
  subject       text,
  body          text,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);

-- ── CRM indexes ───────────────────────────────────────────────────────────--
create index if not exists idx_leads_contact_id       on public.leads(contact_id);
create index if not exists idx_leads_status            on public.leads(status);
create index if not exists idx_clients_contact_id      on public.clients(contact_id);
create index if not exists idx_activities_contact_id   on public.activities(contact_id);
create index if not exists idx_followups_contact_id    on public.followups(contact_id);
create index if not exists idx_followups_due_at        on public.followups(due_at);
create index if not exists idx_followups_completed     on public.followups(completed);
create index if not exists idx_applications_status     on public.applications(status);
create index if not exists idx_invoices_client_id      on public.invoices(client_id);
create index if not exists idx_invoices_status         on public.invoices(status);
create index if not exists idx_email_sends_campaign_id on public.email_sends(campaign_id);
create index if not exists idx_content_posts_idea_id   on public.content_posts(idea_id);
create index if not exists idx_fotf_members_email      on public.fotf_members(email);
create index if not exists idx_fotf_receipts_member_id on public.fotf_receipts(member_id);
create index if not exists idx_fotf_stories_member_id  on public.fotf_stories(member_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. OPS MACHINE (command center / Level 10 / recruiting / meetings)
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.os_goals (
  id            uuid primary key default gen_random_uuid(),
  level         text not null default 'week',
  parent_id     uuid references public.os_goals(id) on delete set null,
  title         text not null,
  owner         text,
  period_label  text,
  status        text default 'active',
  sort          int  default 0,
  created_at    timestamptz default now()
);

create table if not exists public.os_subtasks (
  id            uuid primary key default gen_random_uuid(),
  goal_id       uuid references public.os_goals(id) on delete cascade,
  text          text not null,
  done          boolean default false,
  sort          int default 0,
  created_at    timestamptz default now()
);

create table if not exists public.os_scorecard_metrics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  unit          text,
  target_value  numeric,
  direction     text default 'higher',
  source        text default 'manual',
  crm_key       text,
  sort          int default 0,
  created_at    timestamptz default now()
);

create table if not exists public.os_scorecard_entries (
  id            uuid primary key default gen_random_uuid(),
  metric_id     uuid references public.os_scorecard_metrics(id) on delete cascade,
  week_of       date not null,
  value         numeric,
  created_at    timestamptz default now()
);

create table if not exists public.os_wins (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,
  author        text,
  week_of       date,
  created_at    timestamptz default now()
);

create table if not exists public.os_issues (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  notes         text,
  status        text default 'identify',
  origin        text default 'manual',
  sort          int default 0,
  solved_at     timestamptz,
  created_at    timestamptz default now()
);

create table if not exists public.os_initiatives (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text,
  owner         text,
  status        text default 'on-track',
  progress      int default 0,
  notes         text,
  source        text,
  sort          int default 0,
  created_at    timestamptz default now()
);

create table if not exists public.os_team_members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text,
  region        text,
  status        text default 'active',
  capacity_pct  int default 0,
  scorecard     jsonb default '{}'::jsonb,
  avatar_url    text,
  sort          int default 0,
  created_at    timestamptz default now()
);

create table if not exists public.os_recruiters (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  channel       text,
  region        text,
  candidates    int default 0,
  advanced      int default 0,
  hired         int default 0,
  cost_per_hire numeric,
  upfront_cost  text,
  status        text,
  sort          int default 0,
  created_at    timestamptz default now()
);

create table if not exists public.os_candidates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text,
  recruiter_id  uuid references public.os_recruiters(id) on delete set null,
  stage         text default 'new',
  region        text,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists public.os_journey_stages (
  id            uuid primary key default gen_random_uuid(),
  journey       text default 'default',
  day_offset    int default 0,
  title         text not null,
  type          text default 'milestone',
  description   text,
  sort          int default 0,
  created_at    timestamptz default now()
);

create table if not exists public.os_advisor_notes (
  id            uuid primary key default gen_random_uuid(),
  advisor       text not null,
  met_on        date,
  insights      text,
  action_items  text,
  created_at    timestamptz default now()
);

create table if not exists public.os_meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  met_on        date,
  source        text default 'manual',
  transcript    text,
  summary       text,
  extracted     jsonb,
  processed_at  timestamptz,
  created_at    timestamptz default now()
);

create table if not exists public.os_kv (
  key           text primary key,
  value         jsonb default '{}'::jsonb,
  updated_at    timestamptz default now()
);

create table if not exists public.os_social_posts (
  id            uuid primary key default gen_random_uuid(),
  platform      text,
  author        text,
  url           text,
  text          text,
  likes         bigint,
  comments      bigint,
  shares        bigint,
  views         bigint,
  posted_at     timestamptz,
  captured_at   timestamptz default now()
);
create index if not exists os_social_posts_url_idx on public.os_social_posts (url);

create table if not exists public.os_competitor_ads (
  id            uuid primary key default gen_random_uuid(),
  advertiser    text,
  platform      text,
  ad_text       text,
  ad_url        text,
  started_on    text,
  captured_at   timestamptz default now()
);
create index if not exists os_competitor_ads_url_idx on public.os_competitor_ads (ad_url);

-- Seed scorecard / recruiters / team only when empty (safe to re-run)
do $$
begin
  if not exists (select 1 from public.os_scorecard_metrics) then
    insert into public.os_scorecard_metrics (name, unit, target_value, direction, source, crm_key, sort) values
      ('Cash Collected',        '$', 175000, 'higher', 'manual', null,            0),
      ('Gross Margin',          '%', 70,     'higher', 'manual', null,            1),
      ('MRR',                   '$', 200000, 'higher', 'crm',    'mrr',           2),
      ('Active Clients',        '#', null,   'higher', 'crm',    'active_clients',3),
      ('Audits Booked',         '#', 10,     'higher', 'manual', null,            4),
      ('Proposals Sent',        '#', 8,      'higher', 'manual', null,            5),
      ('Close Rate',            '%', 35,     'higher', 'manual', null,            6),
      ('Show Rate',             '%', 80,     'higher', 'manual', null,            7),
      ('Churn',                 '%', 3,      'lower',  'manual', null,            8),
      ('Field Notes Subscribers','#',null,   'higher', 'manual', null,            9),
      ('FOTF Members',          '#', null,   'higher', 'manual', null,            10);
  end if;

  if not exists (select 1 from public.os_recruiters) then
    insert into public.os_recruiters (name, channel, region, upfront_cost, status, sort) values
      ('Channel 1', 'Recruiter', 'Lebanon',        '$2K retainer', 'Onboarding',     0),
      ('Channel 2', 'Recruiter', 'Brazil',         'TBD',          'Onboarding',     1),
      ('Channel 3', 'Recruiter', 'Eastern Europe', 'TBD',          'Looms Pending',  2),
      ('Channel 4', 'Recruiter', 'Latin America',  'TBD',          'Signing Today',  3),
      ('Channel 5', 'Recruiter', 'Global',         'TBD',          'Call Mon 1:30PM',4),
      ('Channel 6', 'Recruiter', 'Global',         'TBD',          'Intro Pending',  5);
  end if;

  if not exists (select 1 from public.os_team_members) then
    insert into public.os_team_members (name, role, region, status, capacity_pct, sort) values
      ('Mia Louviere', 'Owner', 'US', 'active', 100, 0);
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. CITY LEADS  (RLS on; API uses the service key which bypasses it)
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.city_leads (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text,
  email         text not null,
  phone         text,
  city          text not null,
  linkedin      text,
  background    text,
  why           text,
  revenue_goal  text,
  source        text default 'city-lead-page',
  status        text default 'new',
  notes         text,
  rating        integer,
  contact_id    uuid references public.contacts(id) on delete set null,
  created_at    timestamptz default now()
);

create index if not exists city_leads_status_idx  on public.city_leads(status);
create index if not exists city_leads_created_idx on public.city_leads(created_at desc);

alter table public.city_leads enable row level security;
drop policy if exists "Service role full access" on public.city_leads;
create policy "Service role full access" on public.city_leads
  for all using (auth.role() = 'service_role');


-- ════════════════════════════════════════════════════════════════════════════
-- 4. AUDIT SUBMISSIONS  (assessment results, linked to leads)
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.audit_submissions (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  lead_id         uuid references public.leads(id) on delete set null,
  name            text,
  company         text,
  email           text not null,
  phone           text,
  tier            text,
  dep_pct         integer,
  composite_score numeric(6,2),
  industry        text,
  pain_group      text,
  worst_cat       text,
  second_cat      text,
  cat_scores      jsonb,
  answers         jsonb
);

create index if not exists audit_submissions_email_idx   on public.audit_submissions(email);
create index if not exists audit_submissions_lead_id_idx on public.audit_submissions(lead_id);
create index if not exists audit_submissions_tier_idx    on public.audit_submissions(tier);

-- ============================================================================
-- Done. After running this, set the Vercel env vars to this project and redeploy:
--   SUPABASE_URL              = https://<your-ref>.supabase.co
--   SUPABASE_SERVICE_KEY      = <sb_secret_... service role key>
--   SUPABASE_SERVICE_ROLE_KEY = <same sb_secret_... key>
-- Verify at /api/health  ->  "supabase_connect": "ok"
-- ============================================================================

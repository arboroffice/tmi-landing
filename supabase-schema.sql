-- TMI Admin — Full Database Schema
-- Run this in Supabase SQL Editor: Database → SQL Editor → New query
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS throughout

-- ─────────────────────────────────────────────────────────────────────────────
-- CORE CRM
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMS
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTENT
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- FOUNDERS OF THE FUTURE (FOTF)
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

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
create index if not exists idx_content_posts_idea_id   on public.content_posts(idea_id);
create index if not exists idx_fotf_members_email      on public.fotf_members(email);
create index if not exists idx_fotf_receipts_member_id on public.fotf_receipts(member_id);
create index if not exists idx_fotf_stories_member_id  on public.fotf_stories(member_id);

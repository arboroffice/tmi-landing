-- TMI Ops Machine schema
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS throughout.
-- Apply in the Supabase SQL editor (same project as supabase-schema.sql).

-- ── Command: cascading goals (quarter -> month -> week) ─────────────────────
create table if not exists public.os_goals (
  id            uuid primary key default gen_random_uuid(),
  level         text not null default 'week',          -- 'quarter' | 'month' | 'week'
  parent_id     uuid references public.os_goals(id) on delete set null,
  title         text not null,
  owner         text,
  period_label  text,                                  -- e.g. 'Q3 2026', 'June', 'Wk of Jun 1'
  status        text default 'active',                 -- 'active' | 'done' | 'archived'
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

-- ── Level 10: scorecard ─────────────────────────────────────────────────────
create table if not exists public.os_scorecard_metrics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  unit          text,                                  -- '$', '%', '#'
  target_value  numeric,
  direction     text default 'higher',                 -- 'higher' | 'lower'
  source        text default 'manual',                 -- 'manual' | 'crm'
  crm_key       text,                                  -- which CRM number to pull
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

-- ── Level 10: wins + IDS issues ─────────────────────────────────────────────
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
  status        text default 'identify',               -- 'identify' | 'discuss' | 'solved'
  origin        text default 'manual',                 -- 'manual' | 'scorecard' | 'initiative' | 'ai'
  sort          int default 0,
  solved_at     timestamptz,
  created_at    timestamptz default now()
);

-- ── Initiatives ─────────────────────────────────────────────────────────────
create table if not exists public.os_initiatives (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text,                                  -- 'Media' | 'Product' | 'Delivery' | 'Recruiting' | 'Retention'
  owner         text,
  status        text default 'on-track',               -- 'on-track' | 'behind' | 'done'
  progress      int default 0,
  notes         text,
  source        text,                                  -- advisor / origin
  sort          int default 0,
  created_at    timestamptz default now()
);

-- ── Team roster ─────────────────────────────────────────────────────────────
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

-- ── Recruiting leaderboard + candidates ─────────────────────────────────────
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

-- ── Journey (delivery playbook) ─────────────────────────────────────────────
create table if not exists public.os_journey_stages (
  id            uuid primary key default gen_random_uuid(),
  journey       text default 'default',
  day_offset    int default 0,
  title         text not null,
  type          text default 'milestone',              -- 'call' | 'asset' | 'milestone'
  description   text,
  sort          int default 0,
  created_at    timestamptz default now()
);

-- ── Strategy: advisor log ───────────────────────────────────────────────────
create table if not exists public.os_advisor_notes (
  id            uuid primary key default gen_random_uuid(),
  advisor       text not null,
  met_on        date,
  insights      text,
  action_items  text,
  created_at    timestamptz default now()
);

-- ── Meetings (Fathom -> Claude ingestion) ───────────────────────────────────
create table if not exists public.os_meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  met_on        date,
  source        text default 'manual',                 -- 'fathom' | 'manual'
  transcript    text,
  summary       text,
  extracted     jsonb,
  processed_at  timestamptz,
  created_at    timestamptz default now()
);

-- ── Singletons: vision / flywheel / strategy ladder + offers ────────────────
create table if not exists public.os_kv (
  key           text primary key,
  value         jsonb default '{}'::jsonb,
  updated_at    timestamptz default now()
);

-- ── Apify ingestion targets ─────────────────────────────────────────────────
create table if not exists public.os_social_posts (
  id            uuid primary key default gen_random_uuid(),
  platform      text,                  -- instagram | tiktok | linkedin | x | threads | youtube
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
  platform      text,                  -- google | facebook
  ad_text       text,
  ad_url        text,
  started_on    text,
  captured_at   timestamptz default now()
);
create index if not exists os_competitor_ads_url_idx on public.os_competitor_ads (ad_url);

-- ── Seed data (only if empty, so this stays safe to re-run) ──────────────────
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

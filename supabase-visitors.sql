-- RB2B site-visitor identification.
-- Each identified visit RB2B resolves is upserted here by /api/rb2b-webhook,
-- deduped on identity_key (LinkedIn URL when present, else lowercased email).
-- Safe to run repeatedly.

create table if not exists public.site_visitors (
  id              uuid primary key default gen_random_uuid(),
  identity_key    text not null,
  first_name      text,
  last_name       text,
  email           text,
  personal_email  text,
  linkedin_url    text,
  title           text,
  company         text,
  company_domain  text,
  industry        text,
  company_size    text,
  city            text,
  region          text,
  country         text,
  last_page       text,
  referrer        text,
  source          text default 'rb2b',
  visit_count     int  default 1,
  contact_id      uuid references public.contacts(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  enrolled        boolean default false,
  enrolled_at     timestamptz,
  synced_meta     boolean default false,
  synced_meta_at  timestamptz,
  score           int default 0,
  score_reasons   jsonb,
  alerted         boolean default false,
  converted       boolean default false,
  converted_at    timestamptz,
  linkedin_status text default 'none',
  ai_intro        text,
  enrichment      jsonb,
  raw             jsonb,
  first_seen      timestamptz default now(),
  last_seen       timestamptz default now(),
  created_at      timestamptz default now()
);

create unique index if not exists site_visitors_identity_key_idx on public.site_visitors (identity_key);
create index if not exists site_visitors_last_seen_idx on public.site_visitors (last_seen desc);
create index if not exists site_visitors_email_idx on public.site_visitors (lower(email));

-- Heal pre-existing tables that predate newer columns.
alter table public.site_visitors add column if not exists personal_email text;
alter table public.site_visitors add column if not exists company_size  text;
alter table public.site_visitors add column if not exists synced_meta    boolean default false;
alter table public.site_visitors add column if not exists synced_meta_at timestamptz;
alter table public.site_visitors add column if not exists contact_id     uuid references public.contacts(id) on delete set null;
alter table public.site_visitors add column if not exists lead_id        uuid references public.leads(id) on delete set null;
alter table public.site_visitors add column if not exists enrolled       boolean default false;
alter table public.site_visitors add column if not exists enrolled_at    timestamptz;
alter table public.site_visitors add column if not exists score          int default 0;
alter table public.site_visitors add column if not exists score_reasons  jsonb;
alter table public.site_visitors add column if not exists alerted        boolean default false;
alter table public.site_visitors add column if not exists converted      boolean default false;
alter table public.site_visitors add column if not exists converted_at   timestamptz;
alter table public.site_visitors add column if not exists linkedin_status text default 'none';
alter table public.site_visitors add column if not exists ai_intro       text;
alter table public.site_visitors add column if not exists enrichment     jsonb;
alter table public.site_visitors add column if not exists raw            jsonb;
create index if not exists site_visitors_score_idx on public.site_visitors (score desc);

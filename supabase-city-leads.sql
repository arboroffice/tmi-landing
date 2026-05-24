-- TMI City Leads — Table Migration
-- Run in Supabase SQL Editor: Database → SQL Editor → New query

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

-- Index for fast status filtering in admin
create index if not exists city_leads_status_idx on public.city_leads(status);
create index if not exists city_leads_created_idx on public.city_leads(created_at desc);

-- RLS: only service role can read/write (API uses service key)
alter table public.city_leads enable row level security;

create policy if not exists "Service role full access" on public.city_leads
  for all using (auth.role() = 'service_role');

-- Founders of the Future newsletter.
-- Subscribers live in public.contacts (unsubscribed flag + tags). Issues are
-- composed/sent from the admin and recorded here. Safe to run repeatedly.

create table if not exists public.newsletter_issues (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  subject         text,
  preheader       text,
  format          text default 'standard',   -- standard | long-read | digest | announcement
  body            text,
  status          text default 'draft',       -- draft | sent
  audience_tag    text,                        -- optional; null = all subscribers
  recipient_count int default 0,
  sent_at         timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists newsletter_issues_created_idx on public.newsletter_issues (created_at desc);

-- contacts already carries the subscriber fields; ensure the opt-out + tags columns exist.
alter table public.contacts add column if not exists unsubscribed boolean default false;
alter table public.contacts add column if not exists tags text[];

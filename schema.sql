-- TMI Admin CRM Schema
-- Run this in your Supabase SQL editor (Database > SQL Editor)
-- This replaces the previous minimal schema

-- Contacts (unified people table)
CREATE TABLE IF NOT EXISTS contacts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT,
  email        TEXT,
  phone        TEXT,
  company      TEXT,
  title        TEXT,
  audience     TEXT CHECK (audience IN ('physical', 'online', 'fotf')),
  niche        TEXT,
  tags         TEXT[],
  notes        TEXT,
  unsubscribed BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Leads (sales pipeline)
CREATE TABLE IF NOT EXISTS leads (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','proposal','won','lost')),
  source       TEXT,
  value        NUMERIC(12,2),
  owner        TEXT,
  last_contact TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Clients (active accounts)
CREATE TABLE IF NOT EXISTS clients (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','paused','churned')),
  plan         TEXT,
  mrr          NUMERIC(12,2),
  start_date   DATE,
  owner        TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Email campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  from_name       TEXT DEFAULT 'TMI',
  from_email      TEXT DEFAULT 'hello@tmi-technology.com',
  reply_to        TEXT,
  audience_type   TEXT DEFAULT 'all' CHECK (audience_type IN ('all','segment','custom')),
  audience_filter JSONB,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  sent_count      INT DEFAULT 0,
  open_count      INT DEFAULT 0,
  click_count     INT DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Email send log (per-contact send record)
CREATE TABLE IF NOT EXISTS email_sends (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id  UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  status       TEXT DEFAULT 'sent' CHECK (status IN ('sent','bounced','failed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_audience  ON contacts(audience);
CREATE INDEX IF NOT EXISTS idx_contacts_niche      ON contacts(niche);
CREATE INDEX IF NOT EXISTS idx_contacts_email      ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_leads_status        ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_contact       ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_clients_status      ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_contact     ON clients(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status    ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_sends_campaign      ON email_sends(campaign_id);

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_updated ON contacts;
DROP TRIGGER IF EXISTS leads_updated    ON leads;
DROP TRIGGER IF EXISTS clients_updated  ON clients;

CREATE TRIGGER contacts_updated BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER leads_updated    BEFORE UPDATE ON leads    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER clients_updated  BEFORE UPDATE ON clients  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

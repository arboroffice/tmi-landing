-- TMI Admin CRM Schema
-- Run this in your Supabase SQL editor (Database > SQL Editor)

-- Contacts (unified people table)
CREATE TABLE IF NOT EXISTS contacts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT,
  email        TEXT UNIQUE,
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
  name         TEXT,
  email        TEXT,
  phone        TEXT,
  status       TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','proposal','won','lost')),
  source       TEXT,
  value        NUMERIC(12,2),
  score        INT DEFAULT 0,
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

-- Applications (raw funnel submissions — source of truth for new leads)
CREATE TABLE IF NOT EXISTS applications (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  company      TEXT,
  audience     TEXT,
  niche        TEXT,
  message      TEXT,
  source       TEXT DEFAULT 'funnel',
  status       TEXT DEFAULT 'new' CHECK (status IN ('new','reviewed','accepted','rejected')),
  notes        TEXT,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-ups (task queue)
CREATE TABLE IF NOT EXISTS followups (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  type         TEXT DEFAULT 'call' CHECK (type IN ('call','email','sms','meeting','task')),
  title        TEXT NOT NULL,
  notes        TEXT,
  due_at       TIMESTAMPTZ NOT NULL,
  completed    BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  priority     TEXT DEFAULT 'normal' CHECK (priority IN ('high','normal','low')),
  assigned_to  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Activities (event log per contact/lead/client)
CREATE TABLE IF NOT EXISTS activities (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id   UUID REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  number       TEXT,
  amount       NUMERIC(12,2) NOT NULL,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','viewed','paid','overdue','cancelled')),
  due_date     DATE,
  paid_at      TIMESTAMPTZ,
  description  TEXT,
  line_items   JSONB,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  status       TEXT DEFAULT 'scoping' CHECK (status IN ('scoping','active','delivered','cancelled')),
  start_date   DATE,
  end_date     DATE,
  value        NUMERIC(12,2),
  description  TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Proposals
CREATE TABLE IF NOT EXISTS proposals (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  status       TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','accepted','declined')),
  total        NUMERIC(12,2),
  sections     JSONB,
  sent_at      TIMESTAMPTZ,
  viewed_at    TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- SMS log
CREATE TABLE IF NOT EXISTS sms_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  direction    TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  phone        TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed')),
  twilio_sid   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Social / video content ideas pipeline
CREATE TABLE IF NOT EXISTS content_ideas (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT NOT NULL,
  hook         TEXT,
  notes        TEXT,
  world        TEXT CHECK (world IN ('online','physical','intersection','mission')),
  territory    TEXT,
  formats      TEXT[],
  series       TEXT,
  status       TEXT DEFAULT 'idea' CHECK (status IN ('idea','scripted','filming','editing','scheduled','posted','archived')),
  platforms    TEXT[],
  post_url     TEXT,
  scheduled_at TIMESTAMPTZ,
  posted_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Content calendar
CREATE TABLE IF NOT EXISTS content_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT NOT NULL,
  category     TEXT,
  status       TEXT DEFAULT 'idea' CHECK (status IN ('idea','writing','ready','published')),
  publish_date DATE,
  filename     TEXT,
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
CREATE INDEX IF NOT EXISTS idx_contacts_audience    ON contacts(audience);
CREATE INDEX IF NOT EXISTS idx_contacts_niche        ON contacts(niche);
CREATE INDEX IF NOT EXISTS idx_contacts_email        ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_leads_status          ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_contact         ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_clients_status        ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_contact       ON clients(contact_id);
CREATE INDEX IF NOT EXISTS idx_applications_status   ON applications(status);
CREATE INDEX IF NOT EXISTS idx_followups_due         ON followups(due_at);
CREATE INDEX IF NOT EXISTS idx_followups_completed   ON followups(completed);
CREATE INDEX IF NOT EXISTS idx_activities_contact    ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_client       ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_client       ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_lead        ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_content_ideas_world   ON content_ideas(world);
CREATE INDEX IF NOT EXISTS idx_content_ideas_status  ON content_ideas(status);
CREATE INDEX IF NOT EXISTS idx_content_publish       ON content_items(publish_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_status      ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_sends_campaign        ON email_sends(campaign_id);

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_updated     ON contacts;
DROP TRIGGER IF EXISTS leads_updated        ON leads;
DROP TRIGGER IF EXISTS clients_updated      ON clients;
DROP TRIGGER IF EXISTS applications_updated ON applications;
DROP TRIGGER IF EXISTS followups_updated    ON followups;
DROP TRIGGER IF EXISTS invoices_updated     ON invoices;
DROP TRIGGER IF EXISTS projects_updated     ON projects;
DROP TRIGGER IF EXISTS proposals_updated    ON proposals;
DROP TRIGGER IF EXISTS content_ideas_updated ON content_ideas;
DROP TRIGGER IF EXISTS content_updated      ON content_items;

CREATE TRIGGER contacts_updated     BEFORE UPDATE ON contacts      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER leads_updated        BEFORE UPDATE ON leads         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER clients_updated      BEFORE UPDATE ON clients       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER applications_updated BEFORE UPDATE ON applications  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER followups_updated    BEFORE UPDATE ON followups     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER invoices_updated     BEFORE UPDATE ON invoices      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER projects_updated     BEFORE UPDATE ON projects      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER proposals_updated    BEFORE UPDATE ON proposals     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER content_ideas_updated BEFORE UPDATE ON content_ideas  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER content_updated      BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

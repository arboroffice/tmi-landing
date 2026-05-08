-- Run this in your Supabase SQL editor
-- Creates the audit_submissions table linked to the existing leads table

CREATE TABLE IF NOT EXISTS audit_submissions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  lead_id       uuid REFERENCES leads(id) ON DELETE SET NULL,
  name          text,
  company       text,
  email         text NOT NULL,
  phone         text,
  tier          text,
  dep_pct       integer,
  composite_score numeric(6,2),
  industry      text,
  pain_group    text,
  worst_cat     text,
  second_cat    text,
  cat_scores    jsonb,
  answers       jsonb
);

-- Index for lookups by email and lead
CREATE INDEX IF NOT EXISTS audit_submissions_email_idx ON audit_submissions(email);
CREATE INDEX IF NOT EXISTS audit_submissions_lead_id_idx ON audit_submissions(lead_id);
CREATE INDEX IF NOT EXISTS audit_submissions_tier_idx ON audit_submissions(tier);

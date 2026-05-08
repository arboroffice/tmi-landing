-- Run this in your Supabase SQL editor (Database > SQL Editor)

CREATE TABLE IF NOT EXISTS leads (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  phone      TEXT,
  status     TEXT        DEFAULT 'new' CHECK (status IN ('new', 'booked', 'unsubscribed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  booked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS leads_email_idx  ON leads (lower(email));
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);

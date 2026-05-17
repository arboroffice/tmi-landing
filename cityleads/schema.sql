-- ─────────────────────────────────────────────────────────────────────
-- TMI City Leads — Supabase SQL (full schema, create from scratch)
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to run multiple times — uses IF NOT EXISTS throughout.
-- ─────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────
-- 1. city_leads  — the field reps (linked to Supabase Auth users)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role          text NOT NULL DEFAULT 'city_lead'
                CHECK (role IN ('admin','city_lead')),
  name          text,
  first_name    text,
  last_name     text,
  email         text,
  phone         text,
  avatar_url    text,
  city          text,
  state         text,
  territory     text,
  ai_tone       text,
  notes         text,
  status        text DEFAULT 'active',
  active        boolean NOT NULL DEFAULT true,
  onboarded_at  timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS city_leads_user_id_idx ON city_leads(user_id);


-- ─────────────────────────────────────────────────────────────────────
-- 2. city_businesses  — every business a city lead tracks
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_businesses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_lead_id    uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  business_name   text NOT NULL,
  contact_name    text,
  owner_name      text,
  owner_phone     text,
  owner_email     text,
  owner_linkedin  text,
  email           text,
  phone           text,
  website         text,
  google_place_id text,
  industry        text,
  address         text,
  city            text,
  state           text,
  zip             text,
  lat             decimal(10,7),
  lng             decimal(10,7),
  notes           text,
  stage           text NOT NULL DEFAULT 'seed'
                  CHECK (stage IN (
                    'seed','met_owner','second_visit','problem_identified','warm',
                    'audit_booked','proposal_sent','closed','build_live',
                    'support_active','expansion'
                  )),
  score           text NOT NULL DEFAULT 'cold'
                  CHECK (score IN ('hot','warm','cold')),
  deal_value      decimal(10,2),
  commission      decimal(10,2),
  last_visit_at   timestamptz,
  signed_at       timestamptz,
  updated_at      timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_businesses_lead  ON city_businesses(city_lead_id);
CREATE INDEX IF NOT EXISTS idx_city_businesses_stage ON city_businesses(stage);
CREATE INDEX IF NOT EXISTS idx_city_businesses_score ON city_businesses(score);


-- ─────────────────────────────────────────────────────────────────────
-- 3. city_visits  — every visit, call, text, meeting
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_visits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES city_businesses(id) ON DELETE CASCADE,
  city_lead_id   uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  visited_at     timestamptz NOT NULL DEFAULT now(),
  visit_type     text NOT NULL DEFAULT 'walk_in'
                 CHECK (visit_type IN ('walk_in','coffee','call','email','text','other')),
  notes          text,
  voice_note_url text,
  photos         jsonb DEFAULT '[]',
  tags           jsonb DEFAULT '[]',
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_visits_business ON city_visits(business_id);
CREATE INDEX IF NOT EXISTS idx_city_visits_lead     ON city_visits(city_lead_id);
CREATE INDEX IF NOT EXISTS idx_city_visits_date     ON city_visits(visited_at DESC);


-- ─────────────────────────────────────────────────────────────────────
-- 4. city_follow_ups  — AI-drafted follow-ups queue
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_follow_ups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES city_businesses(id) ON DELETE CASCADE,
  city_lead_id  uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  due_at        timestamptz NOT NULL,
  message       text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','sent','snoozed','done')),
  snoozed_until timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_follow_ups_lead   ON city_follow_ups(city_lead_id);
CREATE INDEX IF NOT EXISTS idx_city_follow_ups_due    ON city_follow_ups(due_at);
CREATE INDEX IF NOT EXISTS idx_city_follow_ups_status ON city_follow_ups(status);


-- ─────────────────────────────────────────────────────────────────────
-- 5. city_handoffs  — push to Mia/Tyler to close
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_handoffs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES city_businesses(id) ON DELETE CASCADE,
  city_lead_id  uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  assigned_to   text NOT NULL CHECK (assigned_to IN ('mia','tyler')),
  urgency       text NOT NULL DEFAULT 'this_month'
                CHECK (urgency IN ('this_week','this_month','when_possible')),
  notes         text NOT NULL,
  status        text NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress','won','lost','cancelled')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_handoffs_lead   ON city_handoffs(city_lead_id);
CREATE INDEX IF NOT EXISTS idx_city_handoffs_status ON city_handoffs(status);


-- ─────────────────────────────────────────────────────────────────────
-- 6. city_earnings  — commissions (admin manages, city lead reads)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_earnings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_lead_id  uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  business_id   uuid REFERENCES city_businesses(id) ON DELETE SET NULL,
  amount        decimal(10,2) NOT NULL,
  earn_type     text NOT NULL DEFAULT 'referral'
                CHECK (earn_type IN ('referral','monthly_support')),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid')),
  description   text,
  paid_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_earnings_lead   ON city_earnings(city_lead_id);
CREATE INDEX IF NOT EXISTS idx_city_earnings_status ON city_earnings(status);


-- ─────────────────────────────────────────────────────────────────────
-- 7. city_personal_notes  — birthdays, family names, interests
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_personal_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES city_businesses(id) ON DELETE CASCADE,
  city_lead_id  uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  note_type     text NOT NULL DEFAULT 'other'
                CHECK (note_type IN ('birthday','anniversary','family','pet','interest','other')),
  note_text     text NOT NULL,
  note_date     date,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_personal_notes_business ON city_personal_notes(business_id);
CREATE INDEX IF NOT EXISTS idx_city_personal_notes_date     ON city_personal_notes(note_date);


-- ─────────────────────────────────────────────────────────────────────
-- 8. city_referrals  — owner → owner referral chains
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_referrals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_business_id  uuid NOT NULL REFERENCES city_businesses(id) ON DELETE CASCADE,
  to_business_id    uuid NOT NULL REFERENCES city_businesses(id) ON DELETE CASCADE,
  city_lead_id      uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'introduced'
                    CHECK (status IN ('introduced','meeting_set','warm','closed')),
  notes             text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_referrals_lead ON city_referrals(city_lead_id);
CREATE INDEX IF NOT EXISTS idx_city_referrals_from ON city_referrals(from_business_id);


-- ─────────────────────────────────────────────────────────────────────
-- 9. city_content_uploads  — photos/videos for Mia/Tyler to post
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_content_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_lead_id  uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  business_id   uuid REFERENCES city_businesses(id) ON DELETE SET NULL,
  url           text NOT NULL,
  media_type    text NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
  caption       text,
  tag           text,
  is_public     boolean DEFAULT true,
  status        text NOT NULL DEFAULT 'uploaded'
                CHECK (status IN ('uploaded','reviewed','posted')),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_content_lead ON city_content_uploads(city_lead_id);


-- ─────────────────────────────────────────────────────────────────────
-- 10. city_win_stories  — learning library (all leads can read)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_win_stories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_lead_id  uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  headline      text NOT NULL,
  story         text NOT NULL,
  lesson        text,
  stage_reached text,
  business_type text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_win_stories_lead ON city_win_stories(city_lead_id);


-- ─────────────────────────────────────────────────────────────────────
-- 11. city_route_stops  — today's planned visits (route planner)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS city_route_stops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_lead_id    uuid NOT NULL REFERENCES city_leads(id) ON DELETE CASCADE,
  business_id     uuid REFERENCES city_businesses(id) ON DELETE SET NULL,
  route_date      date NOT NULL DEFAULT CURRENT_DATE,
  stop_order      int NOT NULL DEFAULT 1,
  planned_action  text,
  status          text NOT NULL DEFAULT 'upcoming'
                  CHECK (status IN ('upcoming','current','done','skipped')),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_city_route_lead ON city_route_stops(city_lead_id);
CREATE INDEX IF NOT EXISTS idx_city_route_date ON city_route_stops(route_date);


-- ─────────────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS  — used by RLS policies
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_city_lead_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM city_leads WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM city_leads WHERE user_id = auth.uid() LIMIT 1;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Admins see everything. City leads see only their own data.
-- ─────────────────────────────────────────────────────────────────────

-- city_leads ──────────────────────────────────────────────────────────
ALTER TABLE city_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_leads_select ON city_leads;
DROP POLICY IF EXISTS city_leads_insert ON city_leads;
DROP POLICY IF EXISTS city_leads_update ON city_leads;
DROP POLICY IF EXISTS city_leads_delete ON city_leads;

CREATE POLICY city_leads_select ON city_leads FOR SELECT USING (
  get_my_role() = 'admin' OR user_id = auth.uid()
);
CREATE POLICY city_leads_insert ON city_leads FOR INSERT WITH CHECK (
  get_my_role() = 'admin'
);
CREATE POLICY city_leads_update ON city_leads FOR UPDATE USING (
  get_my_role() = 'admin' OR user_id = auth.uid()
);
CREATE POLICY city_leads_delete ON city_leads FOR DELETE USING (
  get_my_role() = 'admin'
);

-- city_businesses ─────────────────────────────────────────────────────
ALTER TABLE city_businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_businesses_select ON city_businesses;
DROP POLICY IF EXISTS city_businesses_insert ON city_businesses;
DROP POLICY IF EXISTS city_businesses_update ON city_businesses;
DROP POLICY IF EXISTS city_businesses_delete ON city_businesses;

CREATE POLICY city_businesses_select ON city_businesses FOR SELECT USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);
CREATE POLICY city_businesses_insert ON city_businesses FOR INSERT WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);
CREATE POLICY city_businesses_update ON city_businesses FOR UPDATE USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);
CREATE POLICY city_businesses_delete ON city_businesses FOR DELETE USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);

-- city_visits ─────────────────────────────────────────────────────────
ALTER TABLE city_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_visits_all ON city_visits;
CREATE POLICY city_visits_all ON city_visits USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
) WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);

-- city_follow_ups ─────────────────────────────────────────────────────
ALTER TABLE city_follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_follow_ups_all ON city_follow_ups;
CREATE POLICY city_follow_ups_all ON city_follow_ups USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
) WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);

-- city_handoffs ───────────────────────────────────────────────────────
ALTER TABLE city_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_handoffs_select ON city_handoffs;
DROP POLICY IF EXISTS city_handoffs_insert ON city_handoffs;
DROP POLICY IF EXISTS city_handoffs_update ON city_handoffs;
CREATE POLICY city_handoffs_select ON city_handoffs FOR SELECT USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);
CREATE POLICY city_handoffs_insert ON city_handoffs FOR INSERT WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);
CREATE POLICY city_handoffs_update ON city_handoffs FOR UPDATE USING (
  get_my_role() = 'admin'
);

-- city_earnings ───────────────────────────────────────────────────────
ALTER TABLE city_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_earnings_select ON city_earnings;
DROP POLICY IF EXISTS city_earnings_insert ON city_earnings;
DROP POLICY IF EXISTS city_earnings_update ON city_earnings;
DROP POLICY IF EXISTS city_earnings_delete ON city_earnings;
CREATE POLICY city_earnings_select ON city_earnings FOR SELECT USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);
CREATE POLICY city_earnings_insert ON city_earnings FOR INSERT WITH CHECK (
  get_my_role() = 'admin'
);
CREATE POLICY city_earnings_update ON city_earnings FOR UPDATE USING (
  get_my_role() = 'admin'
);
CREATE POLICY city_earnings_delete ON city_earnings FOR DELETE USING (
  get_my_role() = 'admin'
);

-- city_personal_notes ─────────────────────────────────────────────────
ALTER TABLE city_personal_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_personal_notes_all ON city_personal_notes;
CREATE POLICY city_personal_notes_all ON city_personal_notes USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
) WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);

-- city_referrals ──────────────────────────────────────────────────────
ALTER TABLE city_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_referrals_all ON city_referrals;
CREATE POLICY city_referrals_all ON city_referrals USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
) WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);

-- city_content_uploads ────────────────────────────────────────────────
ALTER TABLE city_content_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_content_uploads_all ON city_content_uploads;
CREATE POLICY city_content_uploads_all ON city_content_uploads USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
) WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);

-- city_win_stories — all city leads can READ, only own lead can write
ALTER TABLE city_win_stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_win_stories_select ON city_win_stories;
DROP POLICY IF EXISTS city_win_stories_insert ON city_win_stories;
DROP POLICY IF EXISTS city_win_stories_update ON city_win_stories;
DROP POLICY IF EXISTS city_win_stories_delete ON city_win_stories;
CREATE POLICY city_win_stories_select ON city_win_stories FOR SELECT USING (
  get_my_role() IS NOT NULL
);
CREATE POLICY city_win_stories_insert ON city_win_stories FOR INSERT WITH CHECK (
  city_lead_id = get_my_city_lead_id() OR get_my_role() = 'admin'
);
CREATE POLICY city_win_stories_update ON city_win_stories FOR UPDATE USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);
CREATE POLICY city_win_stories_delete ON city_win_stories FOR DELETE USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);

-- city_route_stops ────────────────────────────────────────────────────
ALTER TABLE city_route_stops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS city_route_stops_all ON city_route_stops;
CREATE POLICY city_route_stops_all ON city_route_stops USING (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
) WITH CHECK (
  get_my_role() = 'admin' OR city_lead_id = get_my_city_lead_id()
);


-- ─────────────────────────────────────────────────────────────────────
-- HOW TO ONBOARD USERS
-- ─────────────────────────────────────────────────────────────────────
--
-- Step 1: Create user in Supabase Auth (Dashboard → Authentication → Users)
--
-- Step 2: Insert into city_leads linking to that auth user:
--
-- ADMIN (Mia):
--   INSERT INTO city_leads (user_id, name, email, role)
--   VALUES ('<paste auth user uuid>', 'Mia', 'mia@tmi-technology.com', 'admin');
--
-- ADMIN (Tyler):
--   INSERT INTO city_leads (user_id, name, email, role)
--   VALUES ('<paste auth user uuid>', 'Tyler', 'tyler@tmi-technology.com', 'admin');
--
-- CITY LEAD:
--   INSERT INTO city_leads (user_id, name, email, role, city, state, territory)
--   VALUES ('<paste auth user uuid>', 'Sarah Jones', 'sarah@email.com', 'city_lead', 'Austin', 'TX', 'East Austin');
--
-- The app reads role from city_leads.role via get_my_role()
-- and routes: admin → cl-admin.html, city_lead → cl-lead-home.html
-- ─────────────────────────────────────────────────────────────────────

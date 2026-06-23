-- VidX Placement Cell + Learning Level Migration
-- Safe to re-run. Does NOT modify existing working tables destructively.

-- ─── USER COLUMNS ───────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS learning_level text DEFAULT 'Beginner';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_placement_admin boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS placement_score integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS placement_readiness integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS placement_status jsonb DEFAULT '{}'::jsonb;

UPDATE users SET learning_level = 'Beginner' WHERE learning_level IS NULL;

-- ─── PLACEMENT COMPANIES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  logo_url text,
  package_ctc text,
  eligibility_criteria text,
  skills_required text[] DEFAULT '{}',
  job_description text
);

-- ─── PLACEMENT DRIVES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_drives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid REFERENCES placement_companies(id) ON DELETE SET NULL,
  title text NOT NULL,
  drive_date timestamptz,
  registration_deadline timestamptz,
  job_description text,
  eligibility_criteria text,
  eligible_branches text[] DEFAULT '{}',
  eligible_years text[] DEFAULT '{}',
  eligible_batches text[] DEFAULT '{}',
  eligible_student_ids uuid[] DEFAULT '{}',
  is_active boolean DEFAULT true
);

-- ─── PLACEMENT TESTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text,
  test_type text DEFAULT 'mixed',
  duration_mins integer DEFAULT 60,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_published boolean DEFAULT false,
  proctoring_mode text DEFAULT 'standard',
  require_fullscreen boolean DEFAULT true,
  eligible_branches text[] DEFAULT '{}',
  eligible_years text[] DEFAULT '{}',
  eligible_batches text[] DEFAULT '{}',
  eligible_student_ids uuid[] DEFAULT '{}',
  drive_id uuid REFERENCES placement_drives(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS placement_test_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES placement_tests(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  question_type text NOT NULL DEFAULT 'mcq',
  question_text text NOT NULL,
  options jsonb DEFAULT '[]'::jsonb,
  correct_option text,
  marks integer DEFAULT 1,
  difficulty text DEFAULT 'Medium',
  problem_id uuid,
  coding_language text DEFAULT 'python'
);

-- ─── REGISTRATIONS & ATTEMPTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_id uuid NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
  status text DEFAULT 'registered',
  UNIQUE(user_id, drive_id)
);

CREATE TABLE IF NOT EXISTS placement_test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES placement_tests(id) ON DELETE CASCADE,
  started_at timestamptz,
  submitted_at timestamptz,
  status text DEFAULT 'in_progress',
  score integer DEFAULT 0,
  max_score integer DEFAULT 0,
  risk_score integer DEFAULT 0,
  violation_count integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS placement_test_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES placement_test_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES placement_test_questions(id) ON DELETE CASCADE,
  answer jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS placement_proctor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  attempt_id uuid NOT NULL REFERENCES placement_test_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES placement_tests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  severity text DEFAULT 'low',
  details jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS placement_student_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_id uuid REFERENCES placement_drives(id) ON DELETE CASCADE,
  interview_status text DEFAULT 'pending',
  shortlisted boolean DEFAULT false,
  selection_status text DEFAULT 'registered',
  notes text,
  UNIQUE(user_id, drive_id)
);

-- ─── RLS (authenticated read; inserts for own records) ──────────────────────
ALTER TABLE placement_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_test_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_proctor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE placement_student_status ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "placement_read_all" ON placement_companies FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_drives_read" ON placement_drives FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_tests_read" ON placement_tests FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_questions_read" ON placement_test_questions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_reg_insert" ON placement_registrations FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_reg_read_own" ON placement_registrations FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_attempt_insert" ON placement_test_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_attempt_update_own" ON placement_test_attempts FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_attempt_read_own" ON placement_test_attempts FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "placement_proctor_insert" ON placement_proctor_events FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- VidX Schema Upgrade — run in Supabase SQL Editor

-- Submissions: auto-judging fields
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS verdict text;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS passed_cases integer DEFAULT 0;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS total_cases integer DEFAULT 0;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS runtime_ms integer DEFAULT 0;

-- Notifications: title field
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;

-- Bookmarks
CREATE TABLE IF NOT EXISTS problem_bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES problems(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, problem_id)
);

-- Likes
CREATE TABLE IF NOT EXISTS problem_likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES problems(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, problem_id)
);

-- Optional: problem editorial/hint fields
ALTER TABLE problems ADD COLUMN IF NOT EXISTS hint text;
ALTER TABLE problems ADD COLUMN IF NOT EXISTS editorial text;

-- Enable RLS (adjust policies for your project)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_likes ENABLE ROW LEVEL SECURITY;

-- Allow anon read/write for demo (tighten in production)
CREATE POLICY IF NOT EXISTS "notifications_select" ON notifications FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "notifications_update" ON notifications FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS "notifications_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "bookmarks_all" ON problem_bookmarks FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "likes_all" ON problem_likes FOR ALL USING (true);

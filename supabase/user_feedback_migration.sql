-- User Feedback table
-- Collects post-interview experience ratings and suggestions from candidates.
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  session_id      uuid        UNIQUE REFERENCES public.interview_sessions(id) ON DELETE SET NULL,
  overall_rating  int         NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  improvement_areas    text,
  feature_suggestions  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id    ON public.user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_session_id ON public.user_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON public.user_feedback(created_at DESC);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Candidates can insert their own feedback
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_feedback' AND policyname = 'user_feedback_insert_own'
  ) THEN
    CREATE POLICY "user_feedback_insert_own" ON public.user_feedback
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Candidates can read their own feedback (for dedup check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_feedback' AND policyname = 'user_feedback_select_own'
  ) THEN
    CREATE POLICY "user_feedback_select_own" ON public.user_feedback
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

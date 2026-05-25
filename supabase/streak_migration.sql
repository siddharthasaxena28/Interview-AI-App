-- ==========================================
-- Streak & Retention Migration
-- Run this in Supabase SQL Editor
-- ==========================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_session_date date;

-- Index for cron job queries
CREATE INDEX IF NOT EXISTS idx_users_last_session_date ON public.users(last_session_date);

-- Adds expected_keywords to questions table for résumé badge feature.
-- Safe to run multiple times (IF NOT EXISTS / DEFAULT guards).
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS expected_keywords text[] NOT NULL DEFAULT '{}';

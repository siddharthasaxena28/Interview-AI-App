-- Stores the full communication breakdown (4 numeric sub-scores + notes) generated
-- by Claude during feedback generation. Previously only communication_score (the
-- overall number) was persisted; this column retains the full object so the report
-- page can display per-dimension bars and coaching notes.
ALTER TABLE public.feedback_reports
  ADD COLUMN IF NOT EXISTS communication_json JSONB;

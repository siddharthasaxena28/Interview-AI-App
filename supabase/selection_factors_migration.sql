-- Stores the 2-3 factors Claude weighed when computing selection_probability, so the
-- report can show *why* it landed on that number instead of presenting a bare percentage
-- as if it were a precise, opaque measurement. Nullable — older reports won't have it.
ALTER TABLE public.feedback_reports
  ADD COLUMN IF NOT EXISTS selection_factors_json JSONB;

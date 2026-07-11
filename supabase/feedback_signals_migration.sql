-- Adds red_flags_json and standout_moments_json to feedback_reports.
-- red_flags: 0-3 disqualifying patterns the AI identified in the interview.
-- standout_moments: 0-2 genuinely impressive moments worth calling out.
-- Both nullable JSONB; existing rows will have NULL (treated as empty array in the app).
ALTER TABLE public.feedback_reports
  ADD COLUMN IF NOT EXISTS red_flags_json jsonb,
  ADD COLUMN IF NOT EXISTS standout_moments_json jsonb;

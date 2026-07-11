-- Selection Probability Benchmark
--
-- The feedback report shows "Industry average for <round type>: X%" next to the
-- candidate's own selection probability. That number was previously a hardcoded
-- constant. This migration adds a SECURITY DEFINER function that computes a real
-- cross-user average from feedback_reports, grouped by round_type.
--
-- feedback_reports has RLS restricting reads to "own rows only", so a normal
-- authenticated query can't aggregate across users. This function only ever
-- returns an aggregate (average + sample size) — never individual rows or user
-- identifiers — so it's safe to expose to authenticated users without leaking
-- any other candidate's data.

CREATE OR REPLACE FUNCTION public.get_selection_probability_benchmark(p_round_type text)
RETURNS TABLE(avg_probability numeric, sample_size bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(AVG(fr.selection_probability))::numeric AS avg_probability,
    COUNT(*)::bigint AS sample_size
  FROM feedback_reports fr
  JOIN interview_sessions s ON s.id = fr.session_id
  WHERE s.round_type = p_round_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_selection_probability_benchmark(text) TO authenticated;

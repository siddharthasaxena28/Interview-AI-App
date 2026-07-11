-- Atomic weak-area upsert
--
-- updateWeakAreas() in generate-feedback/route.ts previously did a JS-side
-- read-modify-write (SELECT existing avg/count, compute new average, then
-- UPSERT). Two sessions for the same user+topic completing concurrently could
-- both read the same starting values and clobber each other's contribution to
-- the rolling average — a classic lost-update race.
--
-- This function folds the read-modify-write into a single atomic statement:
-- Postgres takes a row lock during ON CONFLICT DO UPDATE, so concurrent calls
-- serialize correctly and neither update is lost.
CREATE OR REPLACE FUNCTION public.upsert_weak_area(
  p_user_id uuid,
  p_topic_tag text,
  p_session_avg numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot update weak areas for another user';
  END IF;

  INSERT INTO weak_areas (user_id, topic_tag, avg_score, session_count, last_updated)
  VALUES (p_user_id, p_topic_tag, ROUND(p_session_avg, 2), 1, now())
  ON CONFLICT (user_id, topic_tag) DO UPDATE SET
    avg_score = ROUND(
      (weak_areas.avg_score * weak_areas.session_count + p_session_avg) / (weak_areas.session_count + 1),
      2
    ),
    session_count = weak_areas.session_count + 1,
    last_updated = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_weak_area(uuid, text, numeric) TO authenticated;

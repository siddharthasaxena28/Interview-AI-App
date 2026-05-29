-- Performance & Security Migration
-- 1. Atomic credit increment function (prevents read-modify-write race)
-- 2. Composite index for the hot dashboard query
-- 3. RLS WITH CHECK clauses to block row-creation bypasses

-- ============================================================
-- 1. Atomic credit increment / decrement
--    GREATEST(0, ...) ensures balance never goes negative on a debit.
-- ============================================================
CREATE OR REPLACE FUNCTION increment_user_credits(p_user_id UUID, p_amount INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
  SET credit_balance = GREATEST(0, credit_balance + p_amount)
  WHERE id = p_user_id;
END;
$$;

-- Only the service role should call this; revoke from anon/authenticated.
REVOKE EXECUTE ON FUNCTION increment_user_credits(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_user_credits(UUID, INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION increment_user_credits(UUID, INT) FROM anon;

-- ============================================================
-- 1b. Unique partial index on credit_transactions so that each
--     completed session can only be charged once. A duplicate INSERT
--     returns a 23505 unique_violation, which chargeSessionCredit()
--     catches and silently ignores — making billing idempotent.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_session_use
  ON credit_transactions (session_id)
  WHERE type = 'session_use';

-- ============================================================
-- 2. Composite index — used by the dashboard, feedback generation,
--    and study-plan queries that filter on (user_id, status) and
--    sort by ended_at DESC.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sessions_user_status_ended
  ON interview_sessions (user_id, status, ended_at DESC);

-- ============================================================
-- 3. RLS WITH CHECK clauses
--    Existing USING clauses prevent reads across users; WITH CHECK
--    prevents a crafted INSERT/UPDATE from creating rows owned by
--    a different user_id.
-- ============================================================

-- interview_sessions
ALTER POLICY sessions_own_rows ON interview_sessions
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- questions (scoped via session ownership)
ALTER POLICY questions_via_session ON questions
  USING (
    session_id IN (
      SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
  );

-- answers (scoped via session ownership)
ALTER POLICY answers_via_session ON answers
  USING (
    session_id IN (
      SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM interview_sessions WHERE user_id = auth.uid()
    )
  );

-- weak_areas
ALTER POLICY weak_areas_own_rows ON weak_areas
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

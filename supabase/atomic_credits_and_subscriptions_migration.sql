-- ==========================================
-- Atomic credit consumption + subscription lifecycle migration
-- Run this in the Supabase SQL Editor (after security_hardening_migration.sql).
--
-- 1. start_interview_session(): atomically claims a session and consumes one credit
--    in a single transaction. Closes the cross-session race where two interviews
--    started at the same moment could both spend the user's last credit, and makes
--    the start idempotent against prefetched / double-fired requests. Unlimited-plan
--    subscribers start without consuming a credit.
-- 2. Allow subscriptions.status = 'pending' so a subscription row created at checkout
--    is not surfaced as paid access until the Razorpay webhook activates it.
-- ==========================================

-- 1. Atomic session-start RPC -------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_interview_session(p_session_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows integer;
  v_plan text;
BEGIN
  -- Claim the session atomically: only the first caller for a 'setup' session wins,
  -- so prefetched / retried / concurrent GETs can't each deduct a credit.
  UPDATE public.interview_sessions
    SET status = 'in_progress', started_at = now()
    WHERE id = p_session_id AND user_id = p_user_id AND status = 'setup';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- Not owned, or already started/completed — nothing to charge.
    RETURN 'already_started';
  END IF;

  -- Unlimited subscribers start without consuming a credit.
  SELECT plan INTO v_plan FROM public.users WHERE id = p_user_id;
  IF v_plan = 'unlimited' THEN
    RETURN 'started';
  END IF;

  -- Consume exactly one credit. The row lock taken by this UPDATE serialises
  -- concurrent starts of *different* sessions, so the balance can never go negative.
  UPDATE public.users
    SET credit_balance = credit_balance - 1
    WHERE id = p_user_id AND credit_balance > 0;
  IF NOT FOUND THEN
    -- No credit available: undo the claim so the user can start again after buying one.
    UPDATE public.interview_sessions
      SET status = 'setup', started_at = NULL
      WHERE id = p_session_id;
    RETURN 'no_credits';
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, session_id)
    VALUES (p_user_id, -1, 'session_use', p_session_id);

  RETURN 'started';
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_interview_session(uuid, uuid) TO authenticated, service_role;

-- 2. Allow a 'pending' subscription state -------------------------------------
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'past_due', 'cancelled'));

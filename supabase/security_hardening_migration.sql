-- ==========================================
-- Security Hardening Migration
-- Run this in the Supabase SQL Editor on an EXISTING database.
-- Fresh installs already get these via schema.sql.
--
-- Fixes:
--   1. Privilege escalation: the old "users_own_row" FOR ALL policy let a user
--      UPDATE their own credit_balance / plan from the browser (anon key). Replace
--      it with a SELECT-only policy; all balance/plan writes are server-side only.
--   2. Data leak: "reports_public_share" used USING (share_token IS NOT NULL), which
--      is always true, exposing every user's feedback report to any logged-in request.
--      Drop it — public share links use the service client filtered by exact token.
--   3. Add CHECK (credit_balance >= 0) so credits can never go negative.
--   4. Add the missing UPDATE policy on user_feedback so feedback re-submission
--      (upsert) actually works for the user-context client.
-- ==========================================

-- 1. users: SELECT-only for the owner; no client write path.
DROP POLICY IF EXISTS "users_own_row" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- 1b. subscriptions + credit_transactions: also SELECT-only. The old FOR ALL policies
--     let a user self-edit their plan / credits_per_cycle / status and fabricate ledger
--     rows. All writes are server-side (service role).
DROP POLICY IF EXISTS "subscriptions_own_rows" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "credit_transactions_own_rows" ON public.credit_transactions;
DROP POLICY IF EXISTS "credit_transactions_select_own" ON public.credit_transactions;
CREATE POLICY "credit_transactions_select_own" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 2. Remove the over-permissive public-share read policy.
DROP POLICY IF EXISTS "reports_public_share" ON public.feedback_reports;

-- 3. Guard against negative balances. Clamp any existing negatives first so the
--    constraint can be added without error.
UPDATE public.users SET credit_balance = 0 WHERE credit_balance < 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_credit_balance_non_negative'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_credit_balance_non_negative CHECK (credit_balance >= 0);
  END IF;
END $$;

-- 4. user_feedback: allow the owner to UPDATE (needed for upsert re-submission).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_feedback' AND policyname='user_feedback_update_own'
  ) THEN
    CREATE POLICY "user_feedback_update_own" ON public.user_feedback
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

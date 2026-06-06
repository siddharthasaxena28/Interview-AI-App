-- ==========================================
-- InterviewAI — Complete Database Schema
-- Run this in Supabase SQL Editor
-- ==========================================

-- Enable pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================
-- TABLES
-- ==========================================

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  avatar_url text,
  credit_balance integer NOT NULL DEFAULT 1 CHECK (credit_balance >= 0),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'payg', 'pro', 'unlimited')),
  referral_code text UNIQUE NOT NULL DEFAULT '',
  -- Anti-abuse: phone verification gates the one free credit.
  phone_number text,
  phone_number_hash text,
  phone_verified boolean NOT NULL DEFAULT false,
  device_fingerprint text,
  free_credit_claimed boolean NOT NULL DEFAULT false,
  last_otp_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One free credit per real phone number, ever. Stores only the salted hash so it
-- can't be used to enumerate which numbers belong to which users.
CREATE TABLE IF NOT EXISTS public.phone_claims (
  phone_number_hash  text PRIMARY KEY,
  first_claimed_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_fingerprint text,
  claimed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('pro', 'unlimited')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'past_due', 'cancelled')),
  razorpay_sub_id text NOT NULL,
  current_period_end timestamptz NOT NULL,
  credits_per_cycle integer NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL CHECK (type IN ('signup', 'purchase', 'subscription', 'referral', 'session_use')),
  session_id uuid,
  -- Razorpay payment/charge id for idempotent crediting (verify-payment and the
  -- webhook both fire for one purchase — the unique index makes the second a no-op).
  razorpay_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One credit grant per Razorpay payment. Partial so non-payment rows (signup,
-- referral, session_use) with NULL ids are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_txn_razorpay_payment_id
  ON public.credit_transactions(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  jd_text text NOT NULL DEFAULT '',
  experience_years integer NOT NULL DEFAULT 0,
  round_type text NOT NULL CHECK (round_type IN ('tech_l1', 'tech_l2', 'managerial', 'hr', 'full_loop')),
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'in_progress', 'completed', 'abandoned')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  text text NOT NULL,
  round_type text NOT NULL,
  difficulty integer NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  topic_tag text NOT NULL DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  asked boolean NOT NULL DEFAULT false,
  expected_keywords text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  transcript_text text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL DEFAULT 0,
  score integer CHECK (score BETWEEN 1 AND 5),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid UNIQUE NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  overall_score integer NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  selection_probability integer NOT NULL CHECK (selection_probability BETWEEN 0 AND 100),
  strengths_json jsonb NOT NULL DEFAULT '[]',
  gaps_json jsonb NOT NULL DEFAULT '[]',
  per_question_json jsonb NOT NULL DEFAULT '[]',
  communication_score integer NOT NULL DEFAULT 0 CHECK (communication_score BETWEEN 0 AND 100),
  report_text text NOT NULL DEFAULT '',
  share_token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weak_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  topic_tag text NOT NULL,
  avg_score numeric(3,2) NOT NULL DEFAULT 0,
  session_count integer NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, topic_tag)
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(referee_id)
);

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- phone_claims has RLS on with NO policies: only the service-role client (which
-- bypasses RLS) may touch it. Clients must never read other users' claim records.
ALTER TABLE public.phone_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weak_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- users: a user may READ only their own row. There is intentionally NO write policy:
-- credit_balance / plan / referral_code are mutated exclusively server-side via the
-- service-role client (verify-payment, webhook, session start, referral, deletion).
-- A FOR ALL / write policy here would let a user self-grant credits or upgrade their
-- plan straight from the browser with the anon key.
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- subscriptions: read-only for the owner. Writes are server-side (service role) via
-- create-subscription / cancel-subscription / the Razorpay webhook. A write policy
-- would let a user self-edit plan, status, or credits_per_cycle from the browser.
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- credit_transactions: read-only for the owner. All inserts are server-side; a client
-- write policy would let a user fabricate purchase/credit ledger rows.
CREATE POLICY "credit_transactions_select_own" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- interview_sessions: own rows only
CREATE POLICY "sessions_own_rows" ON public.interview_sessions
  USING (auth.uid() = user_id);

-- questions: via session ownership
CREATE POLICY "questions_via_session" ON public.questions
  USING (
    session_id IN (
      SELECT id FROM public.interview_sessions WHERE user_id = auth.uid()
    )
  );

-- answers: via session ownership
CREATE POLICY "answers_via_session" ON public.answers
  USING (
    session_id IN (
      SELECT id FROM public.interview_sessions WHERE user_id = auth.uid()
    )
  );

-- feedback_reports: own rows only. Public share-link reads do NOT go through RLS —
-- the /report/[token] page uses the service-role client and filters by the exact
-- share_token. A "share_token IS NOT NULL" policy was removed: because share_token
-- has a NOT NULL default, that predicate was always true and let ANY authenticated
-- anon-key request read EVERY user's report (mass data leak).
CREATE POLICY "reports_own_rows" ON public.feedback_reports
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.interview_sessions WHERE user_id = auth.uid()
    )
  );

-- weak_areas: own rows
CREATE POLICY "weak_areas_own_rows" ON public.weak_areas
  USING (auth.uid() = user_id);

-- referrals: own rows (referrer or referee)
CREATE POLICY "referrals_own_rows" ON public.referrals
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- ==========================================
-- FUNCTION: start_interview_session
-- Atomically claims a session (setup -> in_progress) and consumes one credit in a
-- single transaction. Idempotent against double-fired requests; serialises concurrent
-- starts so the balance can't go negative. Unlimited subscribers don't spend a credit.
-- ==========================================

CREATE OR REPLACE FUNCTION public.start_interview_session(p_session_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows integer;
  v_plan text;
BEGIN
  UPDATE public.interview_sessions
    SET status = 'in_progress', started_at = now()
    WHERE id = p_session_id AND user_id = p_user_id AND status = 'setup';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN 'already_started';
  END IF;

  SELECT plan INTO v_plan FROM public.users WHERE id = p_user_id;
  IF v_plan = 'unlimited' THEN
    RETURN 'started';
  END IF;

  UPDATE public.users
    SET credit_balance = credit_balance - 1
    WHERE id = p_user_id AND credit_balance > 0;
  IF NOT FOUND THEN
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

-- ==========================================
-- FUNCTION: handle_new_user
-- Creates a public.users row when a new auth user signs up
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ref_code text;
BEGIN
  -- Generate unique 8-char referral code
  LOOP
    ref_code := upper(substring(md5(random()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = ref_code);
  END LOOP;

  INSERT INTO public.users (id, email, name, avatar_url, credit_balance, plan, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    1,
    'free',
    ref_code
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, amount, type)
  VALUES (NEW.id, 1, 'signup');

  RETURN NEW;
END;
$$;

-- Trigger: fires after every new auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- INDEXES for performance
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.interview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_questions_session_id ON public.questions(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_session_id ON public.answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON public.answers(question_id);
CREATE INDEX IF NOT EXISTS idx_feedback_session_id ON public.feedback_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_share_token ON public.feedback_reports(share_token);
CREATE INDEX IF NOT EXISTS idx_weak_areas_user_id ON public.weak_areas(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_txn_user_id ON public.credit_transactions(user_id);

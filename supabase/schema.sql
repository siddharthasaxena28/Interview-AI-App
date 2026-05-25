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
  credit_balance integer NOT NULL DEFAULT 1,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'payg', 'pro', 'unlimited')),
  referral_code text UNIQUE NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('pro', 'unlimited')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled')),
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
  asked boolean NOT NULL DEFAULT false
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
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weak_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- users: own row only
CREATE POLICY "users_own_row" ON public.users
  USING (auth.uid() = id);

-- subscriptions: own rows only
CREATE POLICY "subscriptions_own_rows" ON public.subscriptions
  USING (auth.uid() = user_id);

-- credit_transactions: own rows only
CREATE POLICY "credit_transactions_own_rows" ON public.credit_transactions
  USING (auth.uid() = user_id);

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

-- feedback_reports: own or public share token read
CREATE POLICY "reports_own_rows" ON public.feedback_reports
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.interview_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "reports_public_share" ON public.feedback_reports
  FOR SELECT USING (share_token IS NOT NULL);

-- weak_areas: own rows
CREATE POLICY "weak_areas_own_rows" ON public.weak_areas
  USING (auth.uid() = user_id);

-- referrals: own rows (referrer or referee)
CREATE POLICY "referrals_own_rows" ON public.referrals
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

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

  -- Record signup credit transaction
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

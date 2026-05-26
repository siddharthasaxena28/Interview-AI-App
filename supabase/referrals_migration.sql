-- Referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referee_id)
);

-- Reconcile older installs: the base schema.sql once created this table with a
-- `referred_id` column and no `completed_at`, but the app code uses `referee_id`
-- and `completed_at`. Heal an existing table in place (CREATE IF NOT EXISTS above
-- is a no-op when the table already exists, so it can't fix the column on its own).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referred_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'referee_id'
  ) THEN
    ALTER TABLE public.referrals RENAME COLUMN referred_id TO referee_id;
  END IF;
END $$;

ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON public.referrals(referee_id);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own referrals
-- (CREATE POLICY has no IF NOT EXISTS — guard manually)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'referrals_select_own'
  ) THEN
    CREATE POLICY "referrals_select_own" ON public.referrals
      FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);
  END IF;
END $$;

-- Service role can do everything (for server-side operations)

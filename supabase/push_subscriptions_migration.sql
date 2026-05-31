-- ==========================================
-- Web Push Subscriptions Migration
-- Run this in the Supabase SQL Editor.
-- Also set env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
-- Generate keys with:  npx web-push generate-vapid-keys
-- ==========================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users manage only their own subscriptions.
-- Postgres CREATE POLICY does not support IF NOT EXISTS, so guard with a DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_subscriptions' AND policyname='push_subscriptions_select_own') THEN
    CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_subscriptions' AND policyname='push_subscriptions_insert_own') THEN
    CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_subscriptions' AND policyname='push_subscriptions_update_own') THEN
    CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_subscriptions' AND policyname='push_subscriptions_delete_own') THEN
    CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- The service role (cron sender) bypasses RLS automatically.

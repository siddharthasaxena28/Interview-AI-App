-- Restore 1 free credit at signup.
-- OTP verification is deferred; FingerprintJS is the only anti-abuse signal for now.
-- Run this in the Supabase SQL Editor.

-- 1. Restore handle_new_user to grant 1 credit at signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ref_code text;
BEGIN
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

-- 2. Restore the default on credit_balance so any direct INSERTs also get 1.
ALTER TABLE public.users ALTER COLUMN credit_balance SET DEFAULT 1;

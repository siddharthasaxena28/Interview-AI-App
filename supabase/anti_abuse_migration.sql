-- ==========================================
-- InterviewAI — Anti-abuse: phone verification gates the free session
-- Run this in Supabase SQL Editor (idempotent).
-- ==========================================
--
-- Problem: one person with many Google accounts gets unlimited free sessions,
-- because handle_new_user() grants 1 credit on every signup.
--
-- Fix: signup now grants 0 credits. The free credit is granted only when the
-- user verifies a phone number (MSG91 OTP) that has never claimed a free credit
-- before. A device fingerprint provides a secondary soft cap.

-- 1. New columns on users -------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_number       text,
  ADD COLUMN IF NOT EXISTS phone_number_hash  text,
  ADD COLUMN IF NOT EXISTS phone_verified     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS free_credit_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_otp_sent_at   timestamptz;

-- New signups no longer get a credit at the DB-default level.
ALTER TABLE public.users ALTER COLUMN credit_balance SET DEFAULT 0;

-- Existing accounts already went through the old free-credit flow, so mark them
-- claimed. Without this, every legacy user would be re-prompted to "claim".
UPDATE public.users SET free_credit_claimed = true WHERE free_credit_claimed = false;

-- 2. phone_claims: one free credit per real phone, ever ------------------
-- Stores only the salted hash (never the plaintext number), so this table can't
-- be used to enumerate which numbers belong to which users.
CREATE TABLE IF NOT EXISTS public.phone_claims (
  phone_number_hash  text PRIMARY KEY,
  first_claimed_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_fingerprint text,
  claimed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_claims_fingerprint
  ON public.phone_claims(device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

-- RLS on, with NO policies: only the service-role client (which bypasses RLS)
-- may read or write it. Clients must never see other users' claim records.
ALTER TABLE public.phone_claims ENABLE ROW LEVEL SECURITY;

-- 3. handle_new_user: grant 0 credits at signup -------------------------
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

  -- credit_balance 0: the free session is unlocked by phone verification, not signup.
  INSERT INTO public.users (id, email, name, avatar_url, credit_balance, plan, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    0,
    'free',
    ref_code
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 4. claim_free_credit: the phone-gated grant -------------------------
-- Atomic and idempotent. Called server-side (service role) only AFTER MSG91 has
-- confirmed the OTP, so reaching this function already proves phone ownership.
-- Returns one of: granted | phone_already_used | device_limit | already_claimed_by_user
CREATE OR REPLACE FUNCTION public.claim_free_credit(
  p_user_id     uuid,
  p_phone       text,
  p_phone_hash  text,
  p_fingerprint text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_already   boolean;
  v_fp_count  integer;
  v_fp        text := NULLIF(p_fingerprint, '');
BEGIN
  SELECT free_credit_claimed INTO v_already FROM public.users WHERE id = p_user_id;
  IF v_already THEN
    RETURN 'already_claimed_by_user';
  END IF;

  -- Record the verified phone + device on the user, and close the claim window:
  -- one verification per account, whatever the outcome. This stops phone-hopping
  -- to hunt for an unused number.
  UPDATE public.users
    SET phone_number        = p_phone,
        phone_number_hash   = p_phone_hash,
        phone_verified      = true,
        device_fingerprint  = COALESCE(v_fp, device_fingerprint),
        free_credit_claimed = true
    WHERE id = p_user_id;

  -- Secondary soft cap: too many free claims already tied to this device.
  IF v_fp IS NOT NULL THEN
    SELECT count(*) INTO v_fp_count FROM public.phone_claims WHERE device_fingerprint = v_fp;
    IF v_fp_count >= 3 THEN
      RETURN 'device_limit';
    END IF;
  END IF;

  -- Hard gate: one free credit per phone hash, ever. The PK insert is the lock.
  BEGIN
    INSERT INTO public.phone_claims (phone_number_hash, first_claimed_by, device_fingerprint)
      VALUES (p_phone_hash, p_user_id, v_fp);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'phone_already_used';
  END;

  UPDATE public.users SET credit_balance = credit_balance + 1 WHERE id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, amount, type)
    VALUES (p_user_id, 1, 'signup');

  RETURN 'granted';
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_free_credit(uuid, text, text, text) TO service_role;

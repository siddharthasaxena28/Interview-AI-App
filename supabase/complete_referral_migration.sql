-- Atomic referral completion
--
-- completeReferral()/creditReferralBonus() in generate-feedback/route.ts
-- previously claimed the referral row (status pending -> completed) and then
-- credited both parties via two separate RPC + insert round-trips. If the
-- crediting step failed partway (network error, etc.) after the referral was
-- already marked 'completed', the bonus credits would be permanently lost —
-- the referral can never be re-claimed once its status flips.
--
-- This function performs the claim and both credit grants inside a single
-- transaction: either everything commits (referral completed + both users
-- credited + both transactions logged) or nothing does, and the row lock
-- taken by the UPDATE ... WHERE status = 'pending' prevents double-crediting
-- under concurrent calls.
CREATE OR REPLACE FUNCTION public.complete_referral(p_referee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_id uuid;
  v_referrer_id uuid;
BEGIN
  SELECT id, referrer_id INTO v_referral_id, v_referrer_id
  FROM referrals
  WHERE referee_id = p_referee_id AND status = 'pending'
  FOR UPDATE;

  IF v_referral_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE referrals
  SET status = 'completed', completed_at = now()
  WHERE id = v_referral_id AND status = 'pending';

  UPDATE users SET credit_balance = GREATEST(0, credit_balance + 1) WHERE id = v_referrer_id;
  UPDATE users SET credit_balance = GREATEST(0, credit_balance + 1) WHERE id = p_referee_id;

  INSERT INTO credit_transactions (user_id, amount, type) VALUES (v_referrer_id, 1, 'referral');
  INSERT INTO credit_transactions (user_id, amount, type) VALUES (p_referee_id, 1, 'referral');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_referral(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_referral(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_referral(uuid) FROM anon;

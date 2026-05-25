-- ==========================================
-- Payment Idempotency Migration
-- Run this in the Supabase SQL Editor BEFORE deploying the updated payment routes.
--
-- Fixes double-crediting: a single PAYG purchase fires both /api/verify-payment
-- (client) and the payment.captured webhook. Both used to add a credit, so buyers
-- got 2 credits per purchase — and a verified payment could be replayed for more.
-- This adds a Razorpay payment id to credit_transactions with a unique index so
-- crediting is exactly-once across both paths and safe against webhook redelivery.
-- ==========================================

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_txn_razorpay_payment_id
  ON public.credit_transactions(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

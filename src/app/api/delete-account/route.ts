import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { withAuth, apiError } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export const POST = withAuth('delete-account', async ({ user }) => {
  const userId = user.id
  const serviceClient = await createServiceClient()

  // ── What is deleted (PII) ─────────────────────────────────────────────────
  // - Interview sessions → cascades to questions, answers, feedback reports
  // - Weak areas / focus topic analysis
  // - Push notification subscriptions
  // - Referral relationships
  // - App experience feedback
  //
  // ── What is retained (not PII, or legally required) ──────────────────────
  // - auth.users row              → prevents re-granting free signup credit on re-login
  // - public.users row            → anonymised; credit_balance preserved so the user
  //                                 keeps purchased credits when they return
  // - credit_transactions         → 7-year retention required by Income Tax Act 1961

  await Promise.all([
    serviceClient.from('user_feedback').delete().eq('user_id', userId),
    serviceClient.from('push_subscriptions').delete().eq('user_id', userId),
    serviceClient.from('weak_areas').delete().eq('user_id', userId),
    serviceClient.from('referrals').delete().or(`referrer_id.eq.${userId},referee_id.eq.${userId}`),
  ])

  // interview_sessions cascades to questions, answers, and feedback_reports
  await serviceClient.from('interview_sessions').delete().eq('user_id', userId)

  // Anonymise the public.users row — strip all PII.
  // email and name are NOT NULL so we use placeholder values rather than null.
  // referral_code is intentionally retained so any links the user shared before
  // deleting their data continue to work for people they referred.
  const { error: scrubError } = await serviceClient
    .from('users')
    .update({
      name: '',
      email: `deleted_${userId}@deleted.invalid`,
      avatar_url: null,
      current_streak: 0,
      longest_streak: 0,
      last_session_date: null,
      // credit_balance, plan, and referral_code are intentionally NOT touched
    })
    .eq('id', userId)

  if (scrubError) {
    console.error('delete-account scrub error:', scrubError)
    return apiError('Failed to delete account data', 500)
  }

  return NextResponse.json({ success: true })
})

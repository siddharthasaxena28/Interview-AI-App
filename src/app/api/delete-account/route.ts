import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    // - public.users row            → anonymised (name/email/avatar scrubbed), but
    //                                 credit_balance and plan are preserved so the user
    //                                 keeps what they paid for when they return
    // - subscriptions               → retained so active/paid plans survive deletion
    // - credit_transactions         → 7-year retention required by Income Tax Act 1961

    await Promise.all([
      serviceClient.from('user_feedback').delete().eq('user_id', userId),
      serviceClient.from('push_subscriptions').delete().eq('user_id', userId),
      serviceClient.from('weak_areas').delete().eq('user_id', userId),
      serviceClient.from('referrals').delete().or(`referrer_id.eq.${userId},referee_id.eq.${userId}`),
    ])

    // interview_sessions cascades to questions, answers, and feedback_reports
    await serviceClient.from('interview_sessions').delete().eq('user_id', userId)

    // Anonymise the public.users row — strip all PII fields but intentionally
    // preserve credit_balance, plan so paid users return to their rightful credits.
    const { error: scrubError } = await serviceClient
      .from('users')
      .update({
        name: null,
        email: null,
        avatar_url: null,
        referral_code: null,
        current_streak: 0,
        longest_streak: 0,
        last_session_date: null,
        // credit_balance and plan are intentionally NOT touched
      })
      .eq('id', userId)

    if (scrubError) {
      console.error('delete-account scrub error:', scrubError)
      return NextResponse.json({ error: 'Failed to delete account data' }, { status: 500 })
    }

    // Invalidate all active sessions so the user is signed out everywhere
    await serviceClient.auth.admin.signOut(userId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('delete-account error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

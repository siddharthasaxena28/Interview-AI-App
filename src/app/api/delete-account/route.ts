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

    // Delete data in dependency order to avoid FK violations.
    // Credit transactions are kept — Indian accounting law requires 7-year retention
    // of financial records. They reference user_id (an opaque UUID) which becomes
    // fully anonymous once public.users is scrubbed below.
    await Promise.all([
      serviceClient.from('user_feedback').delete().eq('user_id', userId),
      serviceClient.from('push_subscriptions').delete().eq('user_id', userId),
      serviceClient.from('weak_areas').delete().eq('user_id', userId),
      serviceClient.from('referrals').delete().or(`referrer_id.eq.${userId},referee_id.eq.${userId}`),
      serviceClient.from('subscriptions').delete().eq('user_id', userId),
    ])

    // interview_sessions cascades to questions, answers, and feedback_reports
    await serviceClient.from('interview_sessions').delete().eq('user_id', userId)

    // Anonymise the public.users row — do NOT delete it.
    // Keeping the row (with a zeroed-out profile) prevents the same Google account
    // from triggering the handle_new_user() trigger again on re-login, which would
    // re-grant the free signup credit.
    const { error: scrubError } = await serviceClient
      .from('users')
      .update({
        name: null,
        email: null,
        avatar_url: null,
        credit_balance: 0,
        plan: 'free',
        referral_code: null,
        current_streak: 0,
        longest_streak: 0,
        last_session_date: null,
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

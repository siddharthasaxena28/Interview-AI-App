import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { withAuth, apiError } from '@/lib/api-handler'

export const GET = withAuth('session-data', async ({ user, supabase, params }) => {
  const { sessionId } = params

  const { data: session, error: sessionError } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (sessionError || !session) {
    return apiError('Session not found', 404)
  }

  // A completed session already has a frozen feedback report — re-running the
  // leftover questions would append answers the report never accounts for.
  if (session.status === 'completed' || session.status === 'abandoned') {
    return apiError('This interview has already ended. View your report from the dashboard.', 409)
  }

  // Plan + balance gate. Credits are NOT deducted here — only when the interview
  // is successfully completed (generate-feedback). This ensures interrupted or
  // errored sessions don't waste a credit.
  const { data: userData } = await supabase
    .from('users')
    .select('credit_balance, plan')
    .eq('id', user.id)
    .single()

  if (session.status === 'setup' && userData?.plan !== 'unlimited' && (userData?.credit_balance ?? 0) <= 0) {
    return apiError('No credits available', 402)
  }

  // Transition setup → in_progress (idempotent: .eq('status', 'setup') is a no-op if already started)
  if (session.status === 'setup') {
    // Rate limit: max 10 sessions started per hour. Credits are the real abuse
    // guard; this just stops runaway loops. 3/hr was too tight for normal practice.
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { count: recentCount } = await supabase
      .from('interview_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('started_at', 'is', null)
      .gte('started_at', oneHourAgo)
    if ((recentCount ?? 0) >= 10) {
      return apiError('Rate limit exceeded. You can start at most 10 sessions per hour.', 429)
    }

    const svc = await createServiceClient()
    await svc
      .from('interview_sessions')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .eq('status', 'setup')
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('session_id', sessionId)
    .eq('asked', false)
    .order('order_index')

  return NextResponse.json({
    session: { ...session, status: 'in_progress' },
    questions: questions ?? [],
  })
})

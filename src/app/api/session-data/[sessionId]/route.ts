import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: session, error: sessionError } = await supabase
      .from('interview_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
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
      return NextResponse.json({ error: 'No credits available' }, { status: 402 })
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
        return NextResponse.json(
          { error: 'Rate limit exceeded. You can start at most 10 sessions per hour.' },
          { status: 429 }
        )
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
  } catch (error) {
    console.error('session-data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

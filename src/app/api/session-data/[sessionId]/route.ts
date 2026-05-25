import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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

    // Check credit balance
    const { data: userData } = await supabase
      .from('users')
      .select('credit_balance')
      .eq('id', user.id)
      .single()

    // If session is in setup status and user has no credits, block
    if (session.status === 'setup' && (userData?.credit_balance ?? 0) <= 0) {
      return NextResponse.json({ error: 'No credits available' }, { status: 402 })
    }

    // Update session status to in_progress if it was setup
    if (session.status === 'setup') {
      // Rate limit: max 3 sessions started per hour
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
      const { count: recentCount } = await supabase
        .from('interview_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('started_at', 'is', null)
        .gte('started_at', oneHourAgo)
      if ((recentCount ?? 0) >= 3) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. You can start at most 3 sessions per hour.' },
          { status: 429 }
        )
      }

      await supabase
        .from('interview_sessions')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', sessionId)

      // Deduct credit
      await supabase
        .from('users')
        .update({ credit_balance: (userData?.credit_balance ?? 1) - 1 })
        .eq('id', user.id)

      await supabase.from('credit_transactions').insert({
        user_id: user.id,
        amount: -1,
        type: 'session_use',
        session_id: sessionId,
      })
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

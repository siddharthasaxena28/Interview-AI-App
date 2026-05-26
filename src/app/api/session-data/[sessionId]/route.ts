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

    // Plan + balance for the fast-path gate. Unlimited subscribers don't spend credits.
    const { data: userData } = await supabase
      .from('users')
      .select('credit_balance, plan')
      .eq('id', user.id)
      .single()

    const isUnlimited = userData?.plan === 'unlimited'

    // Fast UX gate; the authoritative atomic check is in start_interview_session().
    if (session.status === 'setup' && !isUnlimited && (userData?.credit_balance ?? 0) <= 0) {
      return NextResponse.json({ error: 'No credits available' }, { status: 402 })
    }

    // Start the session if it was in setup.
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

      // Atomic claim + credit consumption in a single DB transaction. Closes the
      // cross-session race (two simultaneous starts both spending the last credit)
      // and is idempotent against double-fired GETs. Runs on the service client.
      const svc = await createServiceClient()
      const { data: rpcResult, error: rpcError } = await svc.rpc('start_interview_session', {
        p_session_id: sessionId,
        p_user_id: user.id,
      })

      if (rpcError && (rpcError.code === 'PGRST202' || rpcError.code === '42883')) {
        // RPC not deployed yet (migration not run) — fall back to an in-app claim.
        const { data: claimed } = await svc
          .from('interview_sessions')
          .update({ status: 'in_progress', started_at: new Date().toISOString() })
          .eq('id', sessionId)
          .eq('user_id', user.id)
          .eq('status', 'setup')
          .select('id')
          .maybeSingle()

        if (claimed && !isUnlimited) {
          const balance = userData?.credit_balance ?? 0
          if (balance > 0) {
            await svc.from('users').update({ credit_balance: balance - 1 }).eq('id', user.id)
            await svc.from('credit_transactions').insert({
              user_id: user.id,
              amount: -1,
              type: 'session_use',
              session_id: sessionId,
            })
          }
        }
      } else if (rpcError) {
        console.error('start_interview_session error:', rpcError)
        return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
      } else if (rpcResult === 'no_credits') {
        return NextResponse.json({ error: 'No credits available' }, { status: 402 })
      }
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

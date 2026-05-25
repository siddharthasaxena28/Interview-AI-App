import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userData } = await supabase
      .from('users')
      .select('email, name, plan, credit_balance, referral_code')
      .eq('id', user.id)
      .single()

    if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, credits_per_cycle')
      .eq('user_id', user.id)
      .in('status', ['active', 'cancelled'])
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ user: userData, subscription: subscription ?? null })
  } catch (error) {
    console.error('account-data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

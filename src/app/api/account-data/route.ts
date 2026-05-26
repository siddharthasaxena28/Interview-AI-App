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

    return NextResponse.json({ user: userData })
  } catch (error) {
    console.error('account-data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

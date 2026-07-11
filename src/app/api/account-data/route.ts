import { NextResponse } from 'next/server'
import { withAuth, apiError } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export const GET = withAuth('account-data', async ({ user, supabase }) => {
  const { data: userData } = await supabase
    .from('users')
    .select('email, name, plan, credit_balance, referral_code')
    .eq('id', user.id)
    .single()

  if (!userData) return apiError('User not found', 404)

  return NextResponse.json({ user: userData })
})

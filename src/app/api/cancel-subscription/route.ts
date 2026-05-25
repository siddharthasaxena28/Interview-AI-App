import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('razorpay_sub_id, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!sub) return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })

    // Cancel at end of current billing cycle via Razorpay
    const Razorpay = (await import('razorpay')).default
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
    await rzp.subscriptions.cancel(sub.razorpay_sub_id, true)

    // Mark as cancelled in Supabase
    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('razorpay_sub_id', sub.razorpay_sub_id)

    // Downgrade user plan to payg (they keep credits till cycle end)
    await supabase
      .from('users')
      .update({ plan: 'payg' })
      .eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('cancel-subscription error:', error)
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
  }
}

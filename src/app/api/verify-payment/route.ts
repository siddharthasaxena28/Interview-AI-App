import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = await request.json() as {
      razorpay_payment_id: string
      razorpay_order_id: string
      razorpay_signature: string
    }

    // Verify HMAC signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex')

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
    }

    // Add 1 credit to user
    const { data: userData } = await supabase
      .from('users')
      .select('credit_balance')
      .eq('id', user.id)
      .single()

    await supabase
      .from('users')
      .update({ credit_balance: (userData?.credit_balance ?? 0) + 1, plan: 'payg' })
      .eq('id', user.id)

    await supabase.from('credit_transactions').insert({
      user_id: user.id,
      amount: 1,
      type: 'purchase',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('verify-payment error:', error)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 })
  }
}

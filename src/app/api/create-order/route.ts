import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount } = await request.json() as { amount: number }
    const amountPaise = amount ?? 24900  // ₹249 in paise

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `receipt_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        user_id: user.id,
        type: 'payg',
      },
    })

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error) {
    console.error('create-order error:', error)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}

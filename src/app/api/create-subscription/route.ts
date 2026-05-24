import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

const PLAN_CONFIG = {
  pro: {
    plan_id: process.env.RAZORPAY_PLAN_PRO!,
    credits_per_cycle: 8,
    plan_name: 'pro',
  },
  unlimited: {
    plan_id: process.env.RAZORPAY_PLAN_UNLIMITED!,
    credits_per_cycle: 999,
    plan_name: 'unlimited',
  },
} as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan } = await request.json() as { plan: 'pro' | 'unlimited' }

    if (!PLAN_CONFIG[plan]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const config = PLAN_CONFIG[plan]

    const subscription = await razorpay.subscriptions.create({
      plan_id: config.plan_id,
      total_count: 12,
      quantity: 1,
      notes: {
        user_id: user.id,
        plan,
      },
    })

    // Save subscription to DB
    await supabase.from('subscriptions').upsert({
      user_id: user.id,
      plan: config.plan_name,
      status: 'active',
      razorpay_sub_id: subscription.id,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      credits_per_cycle: config.credits_per_cycle,
    })

    return NextResponse.json({
      subscription_id: subscription.id,
      key_id: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error) {
    console.error('create-subscription error:', error)
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}

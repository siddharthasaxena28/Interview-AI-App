import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// All amounts in paise (1 INR = 100 paise). Resolved server-side — the
// client sends only a pack key so it can never manufacture a cheaper order.
const PACK_CONFIG = {
  single:  { amount: 24900,  credits: 1,  label: '1 Interview Session' },
  starter: { amount: 99900,  credits: 5,  label: '5 Interview Sessions' },
  serious: { amount: 179900, credits: 10, label: '10 Interview Sessions' },
} as const

type PackKey = keyof typeof PACK_CONFIG

export async function POST(request: NextRequest) {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pack } = await request.json() as { pack: PackKey }

    if (!PACK_CONFIG[pack]) {
      return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })
    }

    const config = PACK_CONFIG[pack]

    const order = await razorpay.orders.create({
      amount: config.amount,
      currency: 'INR',
      receipt: `receipt_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        user_id: user.id,
        pack,
        // Stored as string — Razorpay notes values must be strings.
        // verify-payment reads this back from the order to grant the right credits.
        credits: config.credits.toString(),
      },
    })

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      label: config.label,
      key_id: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error) {
    console.error('create-order error:', error)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase-server'

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    // Verify webhook signature
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex')

    if (!safeEqualHex(expectedSig, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)
    const supabase = await createServiceClient()

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity
      const userId = payment.notes?.user_id
      // notes.credits is set by create-order and copied to the payment by Razorpay.
      // Falls back to 1 for any legacy PAYG orders predating the pack system.
      const credits = Math.max(1, parseInt(payment.notes?.credits ?? '1', 10) || 1)

      if (userId) {
        // Idempotent credit keyed on payment id. /api/verify-payment may have already
        // credited this purchase, and Razorpay can redeliver webhooks — the unique
        // index makes any repeat a no-op.
        const { error: txnError } = await supabase.from('credit_transactions').insert({
          user_id: userId,
          amount: credits,
          type: 'purchase',
          razorpay_payment_id: payment.id,
        })

        if (!txnError) {
          await supabase.rpc('increment_user_credits', { p_user_id: userId, p_amount: credits })
          await supabase.from('users').update({ plan: 'payg' }).eq('id', userId)
        } else if (txnError.code !== '23505') {
          console.error('webhook payment.captured txn error:', txnError)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Razorpay webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

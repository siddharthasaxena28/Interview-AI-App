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

    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload.payment.entity
        const userId = payment.notes?.user_id

        if (userId) {
          // Idempotent credit keyed on the payment id. /api/verify-payment may have
          // already credited this same purchase, and Razorpay can redeliver webhooks —
          // the unique index makes any repeat a no-op.
          const { error: txnError } = await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: 1,
            type: 'purchase',
            razorpay_payment_id: payment.id,
          })

          if (!txnError) {
            const { data: userData } = await supabase
              .from('users')
              .select('credit_balance')
              .eq('id', userId)
              .single()

            await supabase
              .from('users')
              .update({ credit_balance: (userData?.credit_balance ?? 0) + 1 })
              .eq('id', userId)
          } else if (txnError.code !== '23505') {
            console.error('webhook payment.captured txn error:', txnError)
          }
        }
        break
      }

      case 'subscription.charged': {
        const subscription = event.payload.subscription.entity
        const userId = subscription.notes?.user_id
        const chargePaymentId = event.payload.payment?.entity?.id

        if (userId) {
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('credits_per_cycle, plan')
            .eq('razorpay_sub_id', subscription.id)
            .single()

          if (subData) {
            const credits = subData.credits_per_cycle ?? 8

            // Idempotent on the cycle's payment id so a redelivered webhook doesn't
            // top up the balance twice.
            const { error: txnError } = await supabase.from('credit_transactions').insert({
              user_id: userId,
              amount: credits,
              type: 'subscription',
              razorpay_payment_id: chargePaymentId ?? null,
            })

            if (!txnError) {
              const { data: userData } = await supabase
                .from('users')
                .select('credit_balance')
                .eq('id', userId)
                .single()

              await supabase
                .from('users')
                .update({
                  credit_balance: (userData?.credit_balance ?? 0) + credits,
                  plan: subData.plan,
                })
                .eq('id', userId)
            } else if (txnError.code !== '23505') {
              console.error('webhook subscription.charged txn error:', txnError)
            }

            // Update subscription period end (safe to run on every delivery).
            await supabase
              .from('subscriptions')
              .update({
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'active',
              })
              .eq('razorpay_sub_id', subscription.id)
          }
        }
        break
      }

      case 'subscription.cancelled': {
        const subscription = event.payload.subscription.entity

        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('razorpay_sub_id', subscription.id)

        const userId = subscription.notes?.user_id
        if (userId) {
          await supabase
            .from('users')
            .update({ plan: 'free' })
            .eq('id', userId)
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Razorpay webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

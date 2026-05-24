import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase-server'

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

    if (expectedSig !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)
    const supabase = await createServiceClient()

    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload.payment.entity
        const userId = payment.notes?.user_id

        if (userId) {
          const { data: userData } = await supabase
            .from('users')
            .select('credit_balance')
            .eq('id', userId)
            .single()

          await supabase
            .from('users')
            .update({ credit_balance: (userData?.credit_balance ?? 0) + 1 })
            .eq('id', userId)

          await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: 1,
            type: 'purchase',
          })
        }
        break
      }

      case 'subscription.charged': {
        const subscription = event.payload.subscription.entity
        const userId = subscription.notes?.user_id

        if (userId) {
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('credits_per_cycle, plan')
            .eq('razorpay_sub_id', subscription.id)
            .single()

          if (subData) {
            const credits = subData.credits_per_cycle ?? 8
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

            await supabase.from('credit_transactions').insert({
              user_id: userId,
              amount: credits,
              type: 'subscription',
            })

            // Update subscription period end
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

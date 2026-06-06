import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import Razorpay from 'razorpay'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'

// Constant-time compare of two hex signatures. Lengths must match or timingSafeEqual throws.
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

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

    // Verify HMAC signature — proves Razorpay originated this callback.
    const body = `${razorpay_order_id}|${razorpay_payment_id}`
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex')

    if (!safeEqualHex(expectedSignature, razorpay_signature)) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
    }

    // Fetch the order from Razorpay to read how many credits this pack carries.
    // This is the authoritative source — the client never supplies the credit count.
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
    const order = await razorpay.orders.fetch(razorpay_order_id) as {
      notes?: Record<string, string>
    }

    // Ownership check: the order's notes carry the user_id set at create-order time.
    // Reject if missing or mismatched — a leaked/observed payment triple must not
    // be redeemable by a different account.
    const orderUserId = order.notes?.user_id
    if (!orderUserId || orderUserId !== user.id) {
      return NextResponse.json({ error: 'Order does not belong to this user' }, { status: 403 })
    }

    const credits = Math.max(1, parseInt(order.notes?.credits ?? '1', 10) || 1)

    // Credit grants run on the service client: per-user RLS blocks clients from
    // writing their own credit_balance/plan, so all balance mutations are server-only.
    const svc = await createServiceClient()

    // Idempotent credit: insert the transaction first — the unique index on
    // razorpay_payment_id is the lock. If this payment was already credited (here or
    // by the payment.captured webhook), the insert hits a unique violation and we skip
    // the balance bump, so no double credit and no replay.
    const { error: txnError } = await svc.from('credit_transactions').insert({
      user_id: user.id,
      amount: credits,
      type: 'purchase',
      razorpay_payment_id,
    })

    if (txnError) {
      if (txnError.code === '23505') {
        return NextResponse.json({ success: true, alreadyCredited: true })
      }
      console.error('verify-payment txn insert error:', txnError)
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 })
    }

    // First time for this payment — grant the credits atomically.
    await svc.rpc('increment_user_credits', { p_user_id: user.id, p_amount: credits })
    await svc.from('users').update({ plan: 'payg' }).eq('id', user.id)

    return NextResponse.json({ success: true, credits_granted: credits })
  } catch (error) {
    console.error('verify-payment error:', error)
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 })
  }
}

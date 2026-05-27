import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { hashPhone } from '@/lib/phone'
import { otpConfigured, verifyOtpToken } from '@/lib/otp'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    if (!otpConfigured()) {
      return NextResponse.json({ error: 'Verification is not configured' }, { status: 503 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { otp, token, fingerprint } = await request.json() as {
      otp: string
      token: string
      fingerprint?: string
    }

    if (!otp || !/^\d{4,8}$/.test(otp)) {
      return NextResponse.json({ error: 'Enter the code from your email' }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ error: 'Verification session missing. Request a new code.' }, { status: 400 })
    }

    const email = user.email ?? ''
    if (!email) return NextResponse.json({ error: 'No email on account' }, { status: 400 })

    const result = verifyOtpToken(token, email, otp)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Use a hash of the email as the unique identifier (same role phone hash played before).
    const svc = await createServiceClient()
    const emailHash = crypto
      .createHmac('sha256', process.env.PHONE_HASH_SECRET!)
      .update(email.toLowerCase())
      .digest('hex')

    const { data: outcome, error: rpcError } = await svc.rpc('claim_free_credit', {
      p_user_id: user.id,
      p_phone: email,           // store the email in the phone_number column for reference
      p_phone_hash: emailHash,  // unique-per-email hash — same DB lock as before
      p_fingerprint: fingerprint ?? '',
    })

    if (rpcError) {
      console.error('claim_free_credit error:', rpcError)
      return NextResponse.json({ error: 'Verification succeeded but crediting failed' }, { status: 500 })
    }

    const granted = outcome === 'granted'
    return NextResponse.json({ verified: true, granted, reason: outcome })
  } catch (error) {
    console.error('verify-otp error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

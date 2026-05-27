import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { normalizeIndianPhone, hashPhone } from '@/lib/phone'
import { msg91Configured, verifyOtp } from '@/lib/msg91'

export async function POST(request: NextRequest) {
  try {
    if (!msg91Configured()) {
      return NextResponse.json({ error: 'Phone verification is not configured' }, { status: 503 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { phone, otp, fingerprint } = await request.json() as {
      phone: string
      otp: string
      fingerprint?: string
    }

    const normalized = normalizeIndianPhone(phone)
    if (!normalized) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number' }, { status: 400 })
    }
    if (!otp || !/^\d{4,8}$/.test(otp)) {
      return NextResponse.json({ error: 'Enter the code from the SMS' }, { status: 400 })
    }

    // MSG91 ties the OTP to this mobile, so a pass here proves the caller owns it.
    const verification = await verifyOtp(normalized.msg91, otp)
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error ?? 'Incorrect or expired code' }, { status: 400 })
    }

    // Grant runs on the service client: per-user RLS blocks clients from writing
    // their own credit_balance, so all balance mutations are server-only.
    const svc = await createServiceClient()
    const { data: outcome, error: rpcError } = await svc.rpc('claim_free_credit', {
      p_user_id: user.id,
      p_phone: normalized.e164,
      p_phone_hash: hashPhone(normalized.e164),
      p_fingerprint: fingerprint ?? '',
    })

    if (rpcError) {
      console.error('claim_free_credit error:', rpcError)
      return NextResponse.json({ error: 'Verification succeeded but crediting failed' }, { status: 500 })
    }

    // Phone is verified regardless of whether a credit was granted.
    const granted = outcome === 'granted'
    return NextResponse.json({ verified: true, granted, reason: outcome })
  } catch (error) {
    console.error('verify-otp error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

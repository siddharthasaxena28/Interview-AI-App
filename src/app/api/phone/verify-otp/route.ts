import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { normalizeIndianPhone, hashPhone } from '@/lib/phone'
import { fast2smsConfigured, verifyOtpToken } from '@/lib/fast2sms'

export async function POST(request: NextRequest) {
  try {
    if (!fast2smsConfigured()) {
      return NextResponse.json({ error: 'Phone verification is not configured' }, { status: 503 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { phone, otp, token, fingerprint } = await request.json() as {
      phone: string
      otp: string
      token: string
      fingerprint?: string
    }

    const normalized = normalizeIndianPhone(phone)
    if (!normalized) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number' }, { status: 400 })
    }
    if (!otp || !/^\d{4,8}$/.test(otp)) {
      return NextResponse.json({ error: 'Enter the code from the SMS' }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ error: 'Verification session missing. Request a new code.' }, { status: 400 })
    }

    // Verify the signed token — proves the OTP was server-generated for this phone,
    // hasn't been tampered with, and hasn't expired.
    const result = verifyOtpToken(token, normalized.e164, otp)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Grant runs on the service client (RLS blocks per-user credit writes from browser).
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

    const granted = outcome === 'granted'
    return NextResponse.json({ verified: true, granted, reason: outcome })
  } catch (error) {
    console.error('verify-otp error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

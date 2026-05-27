import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { normalizeIndianPhone } from '@/lib/phone'
import { fast2smsConfigured, generateOtp, signOtpToken, sendOtp } from '@/lib/fast2sms'

// Minimum gap between OTP sends per user — blocks resend-spam / SMS bombing.
const RESEND_COOLDOWN_MS = 30_000

export async function POST(request: NextRequest) {
  try {
    if (!fast2smsConfigured()) {
      return NextResponse.json({ error: 'Phone verification is not configured' }, { status: 503 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { phone } = await request.json() as { phone: string }
    const normalized = normalizeIndianPhone(phone)
    if (!normalized) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number' }, { status: 400 })
    }

    const svc = await createServiceClient()
    const { data: profile } = await svc
      .from('users')
      .select('free_credit_claimed, last_otp_sent_at')
      .eq('id', user.id)
      .single()

    if (profile?.free_credit_claimed) {
      return NextResponse.json({ error: 'You have already verified your phone' }, { status: 409 })
    }

    if (profile?.last_otp_sent_at) {
      const elapsed = Date.now() - new Date(profile.last_otp_sent_at).getTime()
      if (elapsed < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
        return NextResponse.json(
          { error: `Please wait ${wait}s before requesting another code` },
          { status: 429 }
        )
      }
    }

    const otp = generateOtp()
    // Extract the bare 10-digit number (msg91 field is "91XXXXXXXXXX")
    const tenDigit = normalized.msg91.slice(2)
    const result = await sendOtp(tenDigit, otp)
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Failed to send OTP' }, { status: 502 })
    }

    await svc.from('users').update({ last_otp_sent_at: new Date().toISOString() }).eq('id', user.id)

    // Return the signed token to the client — it encodes the OTP + expiry server-side
    // so we never need to store the OTP in the DB.
    const token = signOtpToken(normalized.e164, otp)
    return NextResponse.json({ success: true, token })
  } catch (error) {
    console.error('send-otp error:', error)
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 })
  }
}

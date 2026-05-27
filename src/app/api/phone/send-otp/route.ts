import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { otpConfigured, generateOtp, signOtpToken, sendOtpEmail } from '@/lib/otp'

const RESEND_COOLDOWN_MS = 60_000 // 1 minute between sends

export async function POST(request: NextRequest) {
  try {
    if (!otpConfigured()) {
      return NextResponse.json({ error: 'Verification is not configured' }, { status: 503 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const svc = await createServiceClient()
    const { data: profile } = await svc
      .from('users')
      .select('free_credit_claimed, last_otp_sent_at, email')
      .eq('id', user.id)
      .single()

    if (profile?.free_credit_claimed) {
      return NextResponse.json({ error: 'You have already claimed your free session' }, { status: 409 })
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

    const email = user.email ?? profile?.email ?? ''
    if (!email) return NextResponse.json({ error: 'No email on account' }, { status: 400 })

    const otp = generateOtp()
    const result = await sendOtpEmail(email, otp)
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Failed to send code' }, { status: 502 })
    }

    await svc.from('users').update({ last_otp_sent_at: new Date().toISOString() }).eq('id', user.id)

    const token = signOtpToken(email, otp)
    // Mask the email for display: s*****a@gmail.com
    const [local, domain] = email.split('@')
    const maskedEmail = `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}@${domain}`

    return NextResponse.json({ success: true, token, maskedEmail })
  } catch (error) {
    console.error('send-otp error:', error)
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
  }
}

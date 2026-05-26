import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only allow same-origin relative paths. A value like "//evil.com" or
  // "https://evil.com" would otherwise turn the post-login redirect into an
  // open redirect (phishing / token-leak vector).
  const nextParam = searchParams.get('next') ?? '/dashboard'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
  }

  // Bind the Supabase client's cookie writes to the redirect response we actually
  // return. Setting them via next/headers and returning a fresh NextResponse drops
  // the Set-Cookie headers, so the session wasn't persisted on the first try — that
  // was the "takes 2-3 attempts to sign in" loop.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as never)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
  }

  // Re-hydrate profile if this user previously deleted their data.
  // handle_new_user() only fires on auth.users INSERT (first signup ever). Returning
  // deleted users keep their auth.users row to prevent free-credit abuse, so the
  // trigger never re-fires — we must restore their PII from Google OAuth here.
  if (data.user) {
    try {
      const svc = await createServiceClient()
      const { data: profile } = await svc
        .from('users')
        .select('email')
        .eq('id', data.user.id)
        .single()

      if (profile?.email?.endsWith('@deleted.invalid')) {
        const googleEmail = data.user.email ?? ''
        const googleName =
          data.user.user_metadata?.full_name ??
          data.user.user_metadata?.name ??
          googleEmail.split('@')[0]
        const googleAvatar =
          data.user.user_metadata?.avatar_url ??
          data.user.user_metadata?.picture ??
          null
        await svc.from('users').update({
          email: googleEmail,
          name: googleName,
          avatar_url: googleAvatar,
          // referral_code intentionally not touched — retained through deletion so
          // any links the user shared before deleting their data continue to work
        }).eq('id', data.user.id)
      }
    } catch (err) {
      console.error('Profile re-hydration error:', err)
      // non-fatal — user can still log in, profile just won't be repopulated
    }
  }

  // Send welcome email once on signup. created_at is set at first OAuth login and
  // never changes, so a difference < 30 s reliably identifies a brand-new account.
  if (data.user && process.env.RESEND_API_KEY) {
    const ageMs = Date.now() - new Date(data.user.created_at).getTime()
    if (ageMs < 30_000) {
      const name =
        data.user.user_metadata?.full_name?.split(' ')[0] ??
        data.user.email?.split('@')[0] ??
        'there'
      // fire-and-forget — must not delay the login redirect
      void sendWelcomeEmail(data.user.email ?? '', name, origin)
    }
  }

  // Track referral if the referral_code cookie was set before OAuth. Use the user
  // returned by the exchange (no extra network round-trip). Non-fatal.
  const refCode = request.cookies.get('referral_code')?.value
  if (refCode && data.user) {
    try {
      const { data: referrer } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', decodeURIComponent(refCode))
        .single()
      if (referrer && referrer.id !== data.user.id) {
        await supabase.from('referrals').insert({
          referrer_id: referrer.id,
          referee_id: data.user.id,
          status: 'pending',
        })
      }
    } catch {
      // non-fatal — referral tracking failure should not block login
    }
    response.cookies.set('referral_code', '', { maxAge: 0, path: '/' })
  }

  return response
}

async function sendWelcomeEmail(email: string, name: string, origin: string) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'InterviewAI <noreply@interviewai.in>',
      to: email,
      subject: 'Welcome to InterviewAI — your free session is ready',
      html: buildWelcomeHtml(name, appUrl),
    })
  } catch (err) {
    console.error('Welcome email failed:', err)
  }
}

function buildWelcomeHtml(name: string, appUrl: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1d4ed8;padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:24px;">InterviewAI</h1>
      <p style="color:#93c5fd;margin:8px 0 0;">Practice like it&apos;s real. Perform when it matters.</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;margin-bottom:8px;">Hi ${name},</p>
      <p style="color:#374151;margin-bottom:24px;">Welcome! You&apos;ve got <strong>1 free interview session</strong> ready to go. Here&apos;s how it works:</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="vertical-align:top;width:36px;padding-bottom:16px;">
            <div style="background:#eff6ff;border-radius:8px;padding:6px 10px;font-weight:700;color:#1d4ed8;font-size:13px;text-align:center;">1</div>
          </td>
          <td style="padding-left:12px;padding-bottom:16px;vertical-align:top;">
            <div style="font-weight:600;color:#111827;font-size:14px;">Set up your interview</div>
            <div style="color:#6b7280;font-size:14px;margin-top:2px;">Enter the company, role, and job description. Upload your resume for tailored questions.</div>
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;width:36px;padding-bottom:16px;">
            <div style="background:#eff6ff;border-radius:8px;padding:6px 10px;font-weight:700;color:#1d4ed8;font-size:13px;text-align:center;">2</div>
          </td>
          <td style="padding-left:12px;padding-bottom:16px;vertical-align:top;">
            <div style="font-weight:600;color:#111827;font-size:14px;">Speak with the AI interviewer</div>
            <div style="color:#6b7280;font-size:14px;margin-top:2px;">Answer out loud — just like the real thing. The AI listens, probes deeper, and moves on naturally.</div>
          </td>
        </tr>
        <tr>
          <td style="vertical-align:top;width:36px;">
            <div style="background:#eff6ff;border-radius:8px;padding:6px 10px;font-weight:700;color:#1d4ed8;font-size:13px;text-align:center;">3</div>
          </td>
          <td style="padding-left:12px;vertical-align:top;">
            <div style="font-weight:600;color:#111827;font-size:14px;">Get your scorecard</div>
            <div style="color:#6b7280;font-size:14px;margin-top:2px;">Receive a detailed report: overall score, selection probability, strengths, gaps, and per-question feedback.</div>
          </td>
        </tr>
      </table>

      <div style="text-align:center;">
        <a href="${appUrl}/interview/setup" style="background:#1d4ed8;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;display:inline-block;font-size:15px;">Start my first interview &rarr;</a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">InterviewAI &middot; Practice like it&apos;s real. Perform when it matters.</p>
    </div>
  </div>
</body>
</html>`
}

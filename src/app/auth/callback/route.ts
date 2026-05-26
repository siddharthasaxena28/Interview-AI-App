import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

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

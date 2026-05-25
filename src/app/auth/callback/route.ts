import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`)

      // Track referral if the referral_code cookie was set before OAuth
      const refCode = request.cookies.get('referral_code')?.value
      if (refCode) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: referrer } = await supabase
              .from('users')
              .select('id')
              .eq('referral_code', decodeURIComponent(refCode))
              .single()
            if (referrer && referrer.id !== user.id) {
              await supabase.from('referrals').insert({
                referrer_id: referrer.id,
                referee_id: user.id,
                status: 'pending',
              })
            }
          }
        } catch {
          // non-fatal — referral tracking failure should not block login
        }
        response.cookies.set('referral_code', '', { maxAge: 0, path: '/' })
      }

      return response
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}

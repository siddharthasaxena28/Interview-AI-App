import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Following the official @supabase/ssr middleware pattern exactly.
  // NextResponse.next({ request }) is mandatory — it forwards the updated
  // request (with refreshed cookies) to downstream Server Components so they
  // read the same session the middleware just validated. Omitting `request`
  // here is what caused the "2-3 attempts to sign in" loop: the response
  // had fresh cookies but the page still saw the stale request cookies,
  // making every first load look unauthenticated.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Step 1: Mutate the request so downstream handlers see the new cookies.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Step 2: Recreate the response with the updated request, then write
          //         the cookies onto it so the browser receives Set-Cookie headers.
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as never)
          )
        },
      },
    }
  )

  // Do not add any logic between createServerClient and getUser().
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirectResponse = NextResponse.redirect(url)
    // Copy any cookie updates (e.g. cleared tokens) to the redirect response.
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie as never)
    )
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/interview/:path*',
    '/account/:path*',
    '/org/:path*',
  ],
}

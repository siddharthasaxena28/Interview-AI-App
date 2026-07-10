import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createServerSupabaseClient } from './supabase-server'
import { checkRateLimit } from './rate-limit'
import type { User } from '@supabase/supabase-js'

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export interface AuthedContext {
  request: NextRequest
  user: User
  supabase: SupabaseServerClient
  /** Route params for dynamic segments, e.g. { sessionId } — already awaited. */
  params: Record<string, string>
}

export function apiError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

interface WithAuthOptions {
  /**
   * Per-user sliding-window rate limit, keyed `${prefix}:${user.id}`.
   * Routes that need a soft failure mode (e.g. mid-answer-check returning
   * a harmless default instead of 429) should omit this and call
   * checkRateLimit themselves inside the handler.
   */
  rateLimit?: { prefix: string; max: number; windowMs: number }
}

/**
 * Shared scaffolding for authenticated API routes: Supabase client + auth
 * check + optional rate limit + a catch-all that reports to Sentry and
 * returns a uniform 500. Handlers receive the authed user and client and
 * contain only route-specific logic.
 */
export function withAuth(
  routeName: string,
  handler: (ctx: AuthedContext) => Promise<Response>,
  opts?: WithAuthOptions
) {
  return async (
    request: NextRequest,
    routeCtx?: { params: Promise<Record<string, string>> }
  ): Promise<Response> => {
    try {
      const supabase = await createServerSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return apiError('Unauthorized', 401)

      if (opts?.rateLimit) {
        const { prefix, max, windowMs } = opts.rateLimit
        if (!await checkRateLimit(`${prefix}:${user.id}`, max, windowMs)) {
          return apiError('Rate limit exceeded. Try again later.', 429)
        }
      }

      const params = routeCtx?.params ? await routeCtx.params : {}
      return await handler({ request, user, supabase, params })
    } catch (error) {
      console.error(`[${routeName}] error:`, error)
      Sentry.captureException(error, { tags: { route: routeName } })
      return apiError('Internal server error', 500)
    }
  }
}

/**
 * Report an error on a revenue-critical path (payment verification,
 * webhook credit grants). Captured with fatal severity so Sentry alert
 * rules can page on it, and logged either way for provider log search.
 */
export function reportPaymentFailure(context: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(`[payment-failure] ${context}:`, error, extra ?? '')
  Sentry.captureException(error instanceof Error ? error : new Error(`${context}: ${JSON.stringify(error)}`), {
    level: 'fatal',
    tags: { area: 'payments', context },
    extra,
  })
}

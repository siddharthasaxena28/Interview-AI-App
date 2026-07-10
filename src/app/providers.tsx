'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase'

// Ties every event to the logged-in user so funnels (signup → setup →
// interview → paid) can be built per-user instead of per-device.
function PostHogIdentify() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      try {
        if (session?.user) {
          posthog.identify(session.user.id, { email: session.user.email })
        } else if (event === 'SIGNED_OUT') {
          posthog.reset()
        }
      } catch {
        // posthog not initialized
      }
    })
    return () => subscription.unsubscribe()
  }, [])
  return null
}

function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
    if (!dsn) return
    import('@sentry/nextjs').then(({ init, browserTracingIntegration }) => {
      init({ dsn, tracesSampleRate: 0.1, integrations: [browserTracingIntegration()] })
    }).catch(() => {})
  }, [])
  return null
}

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    let url = window.origin + pathname
    if (searchParams?.toString()) {
      url += '?' + searchParams.toString()
    }
    try {
      posthog.capture('$pageview', { $current_url: url })
    } catch {
      // posthog not initialized
    }
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) {
      console.log('PostHog key not set — analytics disabled')
      return
    }
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage',
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <SentryInit />
      <PostHogIdentify />
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  )
}


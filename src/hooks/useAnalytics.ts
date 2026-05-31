'use client'

import { useRef } from 'react'
import { usePostHog } from 'posthog-js/react'

export function useAnalytics() {
  const posthog = usePostHog()

  // Store posthog in a ref so the stable capture function always calls the
  // latest instance without being a dependency in callers' effect dep arrays.
  const posthogRef = useRef(posthog)
  posthogRef.current = posthog

  // analyticsRef.current is the same object identity across renders — callers
  // that include it in useEffect deps won't trigger spurious re-runs.
  const analyticsRef = useRef({
    capture: (event: string, properties?: Record<string, unknown>) => {
      try {
        if (posthogRef.current?.capture) {
          posthogRef.current.capture(event, properties)
        }
      } catch {
        // silently ignore PostHog errors
      }
    },
  })

  return analyticsRef.current
}

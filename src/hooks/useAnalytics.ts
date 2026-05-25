'use client'

import { usePostHog } from 'posthog-js/react'

export function useAnalytics() {
  const posthog = usePostHog()

  return {
    capture: (event: string, properties?: Record<string, unknown>) => {
      try {
        if (posthog?.capture) {
          posthog.capture(event, properties)
        }
      } catch (e) {
        // silently ignore PostHog errors
      }
    },
  }
}

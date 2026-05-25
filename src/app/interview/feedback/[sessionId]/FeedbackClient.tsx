'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'

export default function FeedbackClient({
  sessionId,
  hasReport,
  overallScore,
  selectionProbability,
}: {
  sessionId: string
  hasReport: boolean
  overallScore?: number
  selectionProbability?: number
}) {
  const router = useRouter()
  const posthog = usePostHog()

  useEffect(() => {
    if (hasReport) {
      posthog?.capture('feedback_viewed', {
        session_id: sessionId,
        overall_score: overallScore,
        selection_probability: selectionProbability,
      })
    } else {
      const interval = setInterval(() => {
        router.refresh()
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [hasReport, sessionId, overallScore, selectionProbability, posthog, router])

  return null
}

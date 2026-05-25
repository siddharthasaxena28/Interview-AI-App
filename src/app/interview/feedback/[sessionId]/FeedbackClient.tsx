'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAnalytics } from '@/hooks/useAnalytics'

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
  const analytics = useAnalytics()

  useEffect(() => {
    if (hasReport) {
      analytics.capture('feedback_viewed', {
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
  }, [hasReport, sessionId, overallScore, selectionProbability, analytics, router])

  return null
}

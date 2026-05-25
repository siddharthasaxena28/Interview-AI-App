'use client'

import { useEffect, useRef, useState } from 'react'
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
  const [timedOut, setTimedOut] = useState(false)
  const retriedRef = useRef(false)

  useEffect(() => {
    if (hasReport) {
      analytics.capture('feedback_viewed', {
        session_id: sessionId,
        overall_score: overallScore,
        selection_probability: selectionProbability,
      })
      return
    }

    // Retry generation from the browser after 8 s in case the session page's
    // fire-and-forget timed out. The route is idempotent (upserts), so safe to call again.
    const retryTimer = setTimeout(async () => {
      if (retriedRef.current) return
      retriedRef.current = true
      try {
        await fetch('/api/generate-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
      } catch { /* silent */ }
    }, 8000)

    // Poll every 5 s — server component re-checks the DB and re-renders with the report
    const pollInterval = setInterval(() => router.refresh(), 5000)

    // Give up showing "loading" after 90 s with a helpful message
    const giveUpTimer = setTimeout(() => setTimedOut(true), 90000)

    return () => {
      clearTimeout(retryTimer)
      clearInterval(pollInterval)
      clearTimeout(giveUpTimer)
    }
  }, [hasReport, sessionId, overallScore, selectionProbability, analytics, router])

  if (!hasReport && timedOut) {
    return (
      <div className="mt-6 text-center">
        <p className="text-sm text-amber-600 mb-3">
          Report is taking longer than expected.
        </p>
        <button
          onClick={() => {
            retriedRef.current = false
            setTimedOut(false)
            router.refresh()
          }}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return null
}

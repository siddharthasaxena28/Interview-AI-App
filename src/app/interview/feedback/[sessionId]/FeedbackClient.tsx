'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAnalytics } from '@/hooks/useAnalytics'

const LOADING_STEPS = [
  'Reviewing your answers…',
  'Scoring each question…',
  'Identifying strengths and gaps…',
  'Building your report…',
  'Almost ready…',
]

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
  const [stepIndex, setStepIndex] = useState(0)
  const retriedRef = useRef(false)

  useEffect(() => {
    if (hasReport) return
    const t = setInterval(() => setStepIndex(i => (i + 1) % LOADING_STEPS.length), 2500)
    return () => clearInterval(t)
  }, [hasReport])

  useEffect(() => {
    if (hasReport) {
      analytics.capture('feedback_viewed', {
        session_id: sessionId,
        overall_score: overallScore,
        selection_probability: selectionProbability,
      })
      return
    }
    if (timedOut) return

    // Trigger generation immediately. The session page already fired it as a head
    // start, but the route dedups (returns the existing report), so this is safe and
    // becomes the reliable path with the real auth cookie. When it resolves, refresh
    // so the server component re-renders with the report — no waiting on a poll tick.
    let cancelled = false
    if (!retriedRef.current) {
      retriedRef.current = true
      ;(async () => {
        try {
          const res = await fetch('/api/generate-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
          })
          if (res.ok && !cancelled) router.refresh()
        } catch { /* poll below is the safety net */ }
      })()
    }

    // Safety-net poll — covers the case where generation finished via the head-start
    // call but the await above errored (e.g. transient network).
    const pollInterval = setInterval(() => router.refresh(), 3000)

    // Give up showing "loading" after 60 s with a helpful message
    const giveUpTimer = setTimeout(() => setTimedOut(true), 60000)

    return () => {
      cancelled = true
      clearInterval(pollInterval)
      clearTimeout(giveUpTimer)
    }
  }, [hasReport, timedOut, sessionId, overallScore, selectionProbability, analytics, router])

  if (!hasReport && timedOut) {
    return (
      <div className="mt-6 text-center">
        <div className="inline-block bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4">
          <p className="text-sm text-amber-600 mb-3">
            Report is taking longer than expected.
          </p>
          <button
            onClick={() => {
              retriedRef.current = false
              setTimedOut(false)
              router.refresh()
            }}
            className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!hasReport) {
    return (
      <p className="text-sm text-gray-500 mt-2 transition-all duration-300">
        {LOADING_STEPS[stepIndex]}
      </p>
    )
  }

  return null
}

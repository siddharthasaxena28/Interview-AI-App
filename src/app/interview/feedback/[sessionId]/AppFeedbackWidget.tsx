'use client'

import { useState, useEffect } from 'react'
import { Star, CheckCircle2, X } from 'lucide-react'

const STAR_LABELS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent']

interface Props {
  sessionId: string
}

export default function AppFeedbackWidget({ sessionId }: Props) {
  const storageKey = `iai_fb_${sessionId}`

  const [ready, setReady] = useState(false)         // true once localStorage is checked
  const [dismissed, setDismissed] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [improvements, setImprovements] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    // Don't render until we know the localStorage state (avoids hydration mismatch)
    if (localStorage.getItem(storageKey)) {
      setDismissed(true)
    }
    setReady(true)
  }, [storageKey])

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  async function handleSubmit() {
    if (!rating) return
    setSubmitting(true)
    try {
      await fetch('/api/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          overall_rating: rating,
          improvement_areas: improvements || undefined,
          feature_suggestions: suggestions || undefined,
        }),
      })
      localStorage.setItem(storageKey, '1')
      setSubmitted(true)
    } catch {
      // non-fatal — just hide it
      dismiss()
    } finally {
      setSubmitting(false)
    }
  }

  if (!ready || dismissed) return null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 mt-6 shadow-sm">
      {submitted ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mb-3" />
          <p className="font-semibold text-gray-900 text-lg">Thank you for your feedback!</p>
          <p className="text-gray-500 text-sm mt-1">
            We read every submission and use it to make InterviewAI better.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">How was your experience?</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Your feedback helps us improve InterviewAI for everyone.
              </p>
            </div>
            <button
              onClick={dismiss}
              className="text-gray-400 hover:text-gray-600 transition-colors ml-4 shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Star rating */}
          <div className="flex items-center gap-2 mb-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="transition-transform hover:scale-110 focus:outline-none"
                aria-label={`${star} star — ${STAR_LABELS[star - 1]}`}
              >
                <Star
                  className={`w-8 h-8 transition-colors ${
                    star <= (hovered || rating)
                      ? 'fill-amber-400 text-amber-400'
                      : 'fill-gray-200 text-gray-300'
                  }`}
                />
              </button>
            ))}
            {(hovered || rating) > 0 && (
              <span className="text-sm text-gray-600 ml-1">
                {STAR_LABELS[(hovered || rating) - 1]}
              </span>
            )}
          </div>

          {/* Text fields — only reveal after a star is selected */}
          {rating > 0 && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  What could we improve?{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                  placeholder="Audio quality, question difficulty, UI experience, transcription accuracy…"
                  className="w-full text-sm bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-500/40 resize-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Any features you&apos;d love to see?{' '}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={suggestions}
                  onChange={(e) => setSuggestions(e.target.value)}
                  placeholder="Interview transcript export, video recording, timed practice mode, company-specific question packs…"
                  className="w-full text-sm bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-500/40 resize-none transition-colors"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={dismiss}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-indigo-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {submitting ? 'Submitting…' : 'Submit feedback'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

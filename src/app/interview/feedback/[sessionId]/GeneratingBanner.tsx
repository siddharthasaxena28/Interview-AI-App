'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'

const STEPS = [
  { label: 'Reviewing your answers', thresholdSecs: 0 },
  { label: 'Scoring each question', thresholdSecs: 8 },
  { label: 'Writing your report', thresholdSecs: 18 },
  { label: 'Almost ready…', thresholdSecs: 28 },
]

export default function GeneratingBanner() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const activeStep = STEPS.reduce((acc, s, i) => (elapsed >= s.thresholdSecs ? i : acc), 0)

  return (
    <div className="sticky top-[57px] z-10 bg-indigo-600 px-4 py-3">
      <div className="max-w-4xl mx-auto">
        {/* Top line */}
        <div className="flex items-center justify-center gap-2.5 mb-2.5">
          <div className="w-4 h-4 border-2 border-indigo-300 border-t-white rounded-full animate-spin shrink-0" />
          <span className="text-sm font-medium text-white">Generating your feedback report — this takes about 30 seconds</span>
        </div>
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 sm:gap-3 flex-wrap">
          {STEPS.map((step, i) => {
            const done = i < activeStep
            const active = i === activeStep
            return (
              <div key={step.label} className="flex items-center gap-1.5">
                {i > 0 && <div className={`w-4 h-px ${done ? 'bg-indigo-300' : 'bg-indigo-500'}`} />}
                <div className="flex items-center gap-1">
                  {done ? (
                    <CheckCircle2 className="w-3 h-3 text-indigo-200" />
                  ) : active ? (
                    <div className="w-3 h-3 border border-indigo-200 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  )}
                  <span className={`text-[11px] whitespace-nowrap ${
                    done ? 'text-indigo-200 line-through' : active ? 'text-white font-medium' : 'text-indigo-400'
                  }`}>
                    {step.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

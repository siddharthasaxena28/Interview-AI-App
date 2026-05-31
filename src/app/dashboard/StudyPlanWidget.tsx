'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Calendar, Loader2, ChevronRight, RefreshCw, Target } from 'lucide-react'

interface StudyDay {
  day: number
  focus: string
  action: string
  link: string
  why: string
  roundType: string
}

interface StoredPlan {
  days: StudyDay[]
  generated_at: string
  interview_date?: string
}

const ROUND_COLORS: Record<string, string> = {
  tech_l1: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
  tech_l2: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  managerial: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  hr: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  full_loop: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  drill: 'bg-white/[0.04] text-gray-400 border border-white/[0.08]',
}

export default function StudyPlanWidget() {
  const [plan, setPlan] = useState<StoredPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [interviewDate, setInterviewDate] = useState('')

  // Load cached plan from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('iai_study_plan')
      if (stored) {
        const parsed: StoredPlan = JSON.parse(stored)
        // Only use cached plan if less than 48 hours old
        const age = Date.now() - new Date(parsed.generated_at).getTime()
        if (age < 48 * 3600 * 1000) setPlan(parsed)
      }
      // Try to read interview date from InterviewCountdown's localStorage key
      const countdown = localStorage.getItem('interview-countdown')
      if (countdown) {
        const { date } = JSON.parse(countdown) as { date?: string }
        if (date) setInterviewDate(date)
      }
    } catch { /* ignore */ }
  }, [])

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch('/api/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_date: interviewDate || undefined }),
      })
      if (!res.ok) throw new Error('Failed')
      const data: StoredPlan = await res.json()
      data.interview_date = interviewDate || undefined
      setPlan(data)
      localStorage.setItem('iai_study_plan', JSON.stringify(data))
      setExpanded(true)
    } catch {
      alert('Could not generate study plan. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function refresh() {
    setPlan(null)
    localStorage.removeItem('iai_study_plan')
  }

  // Today's day index (which day of the plan are we on)
  const todayIndex = plan
    ? Math.min(
        plan.days.length - 1,
        Math.floor((Date.now() - new Date(plan.generated_at).getTime()) / 86400000)
      )
    : 0

  return (
    <div className="bg-[#111118] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl overflow-hidden mb-8 transition-all duration-200">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-white">Your Study Plan</h2>
          {plan && (
            <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-medium">
              {plan.days.length} days
            </span>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-6 py-4">
          {!plan ? (
            <div className="text-center py-4">
              <Calendar className="w-10 h-10 text-indigo-500/30 mx-auto mb-3" />
              <p className="text-sm text-gray-400 mb-4">
                Get a personalised day-by-day prep plan based on your weak areas and interview date.
              </p>
              {/* Optional interview date */}
              <div className="flex gap-2 justify-center mb-4">
                <input
                  type="date"
                  value={interviewDate}
                  onChange={e => setInterviewDate(e.target.value)}
                  className="text-sm bg-[#0a0a0f] border border-white/[0.08] text-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                  placeholder="Interview date (optional)"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <button
                onClick={generate}
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-all duration-200 mx-auto"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating plan…</>
                  : <><Calendar className="w-4 h-4" /> Generate My Study Plan</>}
              </button>
            </div>
          ) : (
            <div>
              <div className="space-y-2 mb-4">
                {plan.days.map((d, i) => {
                  const isToday = i === todayIndex
                  const isPast = i < todayIndex
                  const roundKey = d.link.includes('drill') ? 'drill' : d.roundType
                  return (
                    <div
                      key={d.day}
                      className={`rounded-xl border p-3 transition-all ${
                        isToday
                          ? 'ring-1 ring-indigo-500/40 bg-indigo-500/5 border-indigo-500/30'
                          : isPast
                            ? 'border-white/[0.04] bg-white/[0.02] opacity-40'
                            : 'border-white/[0.06] bg-white/[0.01]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isToday ? 'bg-indigo-600 text-white' : isPast ? 'bg-white/[0.06] text-gray-600' : 'bg-white/[0.04] text-gray-500'
                        }`}>
                          {isToday ? 'Today' : `D${d.day}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROUND_COLORS[roundKey] ?? 'bg-white/[0.04] text-gray-400 border border-white/[0.08]'}`}>
                              {d.focus}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300">{d.action}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{d.why}</p>
                        </div>
                        {isToday && (
                          <Link
                            href={d.link}
                            className="flex-shrink-0 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap"
                          >
                            Start →
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={refresh}
                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate plan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

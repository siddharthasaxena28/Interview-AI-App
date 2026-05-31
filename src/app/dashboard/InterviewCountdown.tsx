'use client'

import { useState, useEffect } from 'react'
import { Calendar, X } from 'lucide-react'

const STORAGE_KEY = 'interviewai_next_interview_date'

function getDaysRemaining(dateStr: string): number {
  // Parse YYYY-MM-DD as LOCAL midnight (appending time avoids UTC parsing,
  // which would shift the day in timezones behind UTC).
  const target = new Date(dateStr + 'T00:00:00')
  target.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export default function InterviewCountdown() {
  const [interviewDate, setInterviewDate] = useState<string>('')
  const [inputDate, setInputDate] = useState<string>('')
  const [editing, setEditing] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setInterviewDate(saved)
      setInputDate(saved)
    }
  }, [])

  if (!mounted) return null

  function save() {
    if (!inputDate) return
    localStorage.setItem(STORAGE_KEY, inputDate)
    setInterviewDate(inputDate)
    setEditing(false)
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY)
    setInterviewDate('')
    setInputDate('')
    setEditing(false)
  }

  // Today's date in YYYY-MM-DD for the min attribute
  const todayStr = new Date().toISOString().split('T')[0]

  if (!interviewDate || editing) {
    return (
      <div className="bg-[#111118] border border-white/[0.06] rounded-2xl p-4 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-white">When is your real interview?</span>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={inputDate}
            min={todayStr}
            onChange={(e) => setInputDate(e.target.value)}
            className="flex-1 bg-[#0a0a0f] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
          />
          <button
            onClick={save}
            disabled={!inputDate}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
          >
            Set date
          </button>
          {editing && (
            <button onClick={() => setEditing(false)} className="text-gray-600 hover:text-gray-400 px-2 transition-colors">
              Cancel
            </button>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-2">
          We&apos;ll show a countdown so you can track how many days you have left to practise.
        </p>
      </div>
    )
  }

  const daysLeft = getDaysRemaining(interviewDate)
  const formattedDate = new Date(interviewDate + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  if (daysLeft < 0) {
    return (
      <div className="bg-[#111118] border border-white/[0.06] rounded-2xl p-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Calendar className="w-4 h-4" />
          <span>Your interview on {formattedDate} has passed. Did it go well?</span>
        </div>
        <button onClick={clear} className="text-gray-600 hover:text-gray-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  const urgencyBg = daysLeft <= 3
    ? 'bg-red-500/5 border-red-500/20'
    : daysLeft <= 7
      ? 'bg-amber-500/5 border-amber-500/20'
      : 'bg-indigo-500/5 border-indigo-500/20'

  const textColor = daysLeft <= 3 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-indigo-400'
  const subTextColor = daysLeft <= 3 ? 'text-red-500/70' : daysLeft <= 7 ? 'text-amber-500/70' : 'text-indigo-500/70'
  const digitColor = daysLeft <= 3 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-white'

  return (
    <div className={`border rounded-2xl p-4 mb-8 flex items-center justify-between ${urgencyBg}`}>
      <div className="flex items-center gap-3">
        <Calendar className={`w-5 h-5 ${textColor}`} />
        <div>
          <div className={`font-semibold text-sm ${digitColor}`}>
            {daysLeft === 0
              ? 'Your interview is TODAY!'
              : daysLeft === 1
                ? '1 day until your interview'
                : `${daysLeft} days until your interview`}
          </div>
          <div className={`text-xs ${subTextColor}`}>{formattedDate}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className={`text-xs underline ${subTextColor} hover:opacity-80 transition-opacity`}
        >
          Change
        </button>
        <button onClick={clear} className="text-gray-600 hover:text-gray-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

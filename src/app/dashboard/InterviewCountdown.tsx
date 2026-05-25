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
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-900">When is your real interview?</span>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={inputDate}
            min={todayStr}
            onChange={(e) => setInputDate(e.target.value)}
            className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <button
            onClick={save}
            disabled={!inputDate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Set date
          </button>
          {editing && (
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 px-2">
              Cancel
            </button>
          )}
        </div>
        <p className="text-xs text-blue-600 mt-2">
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
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Calendar className="w-4 h-4" />
          <span>Your interview on {formattedDate} has passed. Did it go well?</span>
        </div>
        <button onClick={clear} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  const urgencyColor = daysLeft <= 3
    ? 'bg-red-50 border-red-200'
    : daysLeft <= 7
      ? 'bg-amber-50 border-amber-200'
      : 'bg-blue-50 border-blue-200'

  const textColor = daysLeft <= 3 ? 'text-red-700' : daysLeft <= 7 ? 'text-amber-700' : 'text-blue-700'
  const subTextColor = daysLeft <= 3 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-blue-500'

  return (
    <div className={`border rounded-xl p-4 mb-8 flex items-center justify-between ${urgencyColor}`}>
      <div className="flex items-center gap-3">
        <Calendar className={`w-5 h-5 ${textColor}`} />
        <div>
          <div className={`font-semibold text-sm ${textColor}`}>
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
          className={`text-xs underline ${subTextColor} hover:opacity-80`}
        >
          Change
        </button>
        <button onClick={clear} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

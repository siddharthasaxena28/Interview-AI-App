'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, MessageSquare, Lightbulb, Copy, Check } from 'lucide-react'
import type { PerQuestionFeedback } from '@/types'

interface QuestionRow {
  id: string
  text: string
  difficulty: number
  topic_tag: string
}

interface AnswerRow {
  question_id: string
  transcript_text: string
  duration_seconds: number
}

interface Props {
  perQuestion: PerQuestionFeedback[]
  questions: QuestionRow[]
  answers: AnswerRow[]
}

const SCORE_LABEL = ['', 'Needs Work', 'Below Par', 'Developing', 'Good', 'Excellent'] as const
const scoreBadgeBg = (s: number) => s >= 4 ? 'bg-green-500' : s === 3 ? 'bg-amber-500' : 'bg-red-500'
const scoreTextColor = (s: number) => s >= 4 ? 'text-green-600' : s === 3 ? 'text-amber-600' : 'text-red-600'

export default function FeedbackPerQuestion({ perQuestion, questions, answers }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  // Answers are keyed by the real question UUID from the DB.
  // Questions are looked up by position (index) rather than by pq.question_id because
  // older reports may have fabricated IDs from Claude that don't match the DB.
  const aMap = new Map(answers.map(a => [a.question_id, a]))

  const allOpen = expanded.size === perQuestion.length && perQuestion.length > 0

  function toggleAll() {
    setExpanded(allOpen ? new Set() : new Set(perQuestion.map((_, i) => i)))
  }

  function toggle(i: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Per-Question Breakdown</h2>
        <button
          onClick={toggleAll}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="space-y-2">
        {perQuestion.map((pq, i) => {
          // Use index to find the question — reliable even when pq.question_id is wrong.
          // Use the real question ID (from questions[i]) to find the answer.
          const q = questions[i]
          const a = aMap.get(q?.id ?? pq.question_id)
          const open = expanded.has(i)

          return (
            <div key={i} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* Header row */}
              <button
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                onClick={() => toggle(i)}
              >
                {/* Score badge */}
                <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center text-white ${scoreBadgeBg(pq.score)}`}>
                  <span className="text-base font-bold leading-none">{pq.score}</span>
                  <span className="text-[9px] opacity-75 mt-0.5">/5</span>
                </div>

                {/* Meta + truncated question */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-400 font-medium">Q{i + 1}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                      {q?.topic_tag?.replace(/_/g, ' ') ?? 'general'}
                    </span>
                    <span className="text-xs text-gray-400">Diff {q?.difficulty ?? '?'}/5</span>
                    <span className={`text-xs font-semibold ${scoreTextColor(pq.score)}`}>
                      {SCORE_LABEL[pq.score] ?? ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 font-medium truncate">{q?.text ?? 'Question'}</p>
                </div>

                <div className="flex-shrink-0 text-gray-400">
                  {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Expanded detail */}
              {open && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                  {/* Full question text */}
                  <p className="text-sm text-gray-600 italic leading-relaxed">
                    &ldquo;{q?.text ?? 'Question'}&rdquo;
                  </p>

                  {/* Answer transcript */}
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-blue-700">Your answer</span>
                        {a && a.duration_seconds > 0 && (
                          <span className="text-xs text-blue-400">· {Math.round(a.duration_seconds)}s</span>
                        )}
                      </div>
                      {a?.transcript_text && (
                        <button
                          onClick={() => copyText(a.transcript_text, `ans-${i}`)}
                          className="text-blue-400 hover:text-blue-600 transition-colors"
                          title="Copy answer"
                        >
                          {copied === `ans-${i}`
                            ? <Check className="w-3.5 h-3.5 text-green-500" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                    {a?.transcript_text ? (
                      <p className="text-sm text-blue-900 leading-relaxed">{a.transcript_text}</p>
                    ) : (
                      <p className="text-sm text-blue-400 italic">No answer recorded for this question.</p>
                    )}
                  </div>

                  {/* Coach feedback */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <span className="text-xs font-semibold text-gray-600 block mb-1.5">Coach Feedback</span>
                    <p className="text-sm text-gray-700 leading-relaxed">{pq.feedback}</p>
                  </div>

                  {/* Ideal answer hint — only shown when provided (low-scoring answers) */}
                  {pq.ideal_answer_hint && (
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-xs font-semibold text-amber-700">What a strong answer covers</span>
                      </div>
                      <p className="text-sm text-amber-800 leading-relaxed whitespace-pre-line">
                        {pq.ideal_answer_hint}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

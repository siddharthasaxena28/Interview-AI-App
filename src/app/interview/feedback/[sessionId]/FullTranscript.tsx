'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Bot, User, FileText } from 'lucide-react'

interface Props {
  questions: Array<{ id: string; text: string; difficulty: number; topic_tag: string; expected_keywords?: string[] }>
  answers: Array<{ question_id: string; transcript_text: string; duration_seconds: number }>
  perQuestion: Array<{ question_id: string; score: number }>
}

const scoreBadgeCls = (s: number) =>
  s >= 4
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : s === 3
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-red-100 text-red-700 border-red-200'

const SCORE_LABEL = ['', 'Needs Work', 'Below Par', 'Developing', 'Good', 'Excellent'] as const

export default function FullTranscript({ questions, answers, perQuestion }: Props) {
  const [open, setOpen] = useState(false)

  const answerMap = new Map(answers.map((a) => [a.question_id, a]))
  const scoreMap = new Map(perQuestion.map((p) => [p.question_id, p.score]))

  const answeredCount = questions.filter((q) => answerMap.has(q.id)).length

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-100 border border-gray-200 rounded-xl flex items-center justify-center">
            <FileText className="w-4 h-4 text-gray-500" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900 text-sm">Full Interview Transcript</div>
            <div className="text-xs text-gray-500">
              {answeredCount} of {questions.length} questions answered — read the complete conversation
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-200 px-5 py-5 space-y-6">
          {questions.map((q, i) => {
            const a = answerMap.get(q.id)
            const score = scoreMap.get(q.id)
            const isResumeQ = q.expected_keywords?.includes('__resume')

            return (
              <div key={q.id} className="space-y-3">
                {/* Interviewer question */}
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-xs font-semibold text-gray-500">Interviewer · Q{i + 1}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize">
                        {q.topic_tag.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-400">Diff {q.difficulty}/5</span>
                      {isResumeQ && (
                        <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">
                          From your résumé
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-50 border border-gray-200 rounded-xl rounded-tl-sm px-3.5 py-2.5">
                      <p className="text-sm text-gray-900 leading-relaxed">{q.text}</p>
                    </div>
                  </div>
                </div>

                {/* Candidate answer */}
                <div className="flex gap-3 flex-row-reverse">
                  <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-end gap-2 flex-wrap mb-1.5">
                      {score !== undefined && (
                        <span className={`text-xs font-semibold border px-2 py-0.5 rounded-full ${scoreBadgeCls(score)}`}>
                          {score}/5 · {SCORE_LABEL[score] ?? ''}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-gray-500">You</span>
                      {a && a.duration_seconds > 0 && (
                        <span className="text-xs text-gray-400">{Math.round(a.duration_seconds)}s</span>
                      )}
                    </div>
                    <div className={`rounded-xl rounded-tr-sm px-3.5 py-2.5 ${
                      a?.transcript_text
                        ? 'bg-indigo-50 border border-indigo-200'
                        : 'bg-gray-50 border border-gray-200'
                    }`}>
                      <p className={`text-sm leading-relaxed ${
                        a?.transcript_text ? 'text-gray-800' : 'text-gray-400 italic'
                      }`}>
                        {a?.transcript_text || 'No answer recorded for this question.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Divider between questions */}
                {i < questions.length - 1 && (
                  <div className="border-b border-gray-100 pt-1" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

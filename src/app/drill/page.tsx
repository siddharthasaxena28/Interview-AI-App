'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Mic, MicOff, ChevronRight, CheckCircle, RotateCcw, Zap, Clock, ArrowRight, Sparkles } from 'lucide-react'
import { getDailyDrillQuestions, type DrillQuestion, type DrillRoundFilter } from '@/lib/drill-questions'
import type { RoundType } from '@/types'

const ROUND_LABELS: Record<RoundType, string> = {
  tech_l1: 'Tech L1',
  tech_l2: 'Tech L2',
  managerial: 'Managerial',
  hr: 'HR',
  full_loop: 'Full Loop',
}

const ROUND_COLORS: Record<RoundType, string> = {
  tech_l1: 'bg-blue-100 text-blue-700',
  tech_l2: 'bg-purple-100 text-purple-700',
  managerial: 'bg-indigo-100 text-indigo-700',
  hr: 'bg-green-100 text-green-700',
  full_loop: 'bg-gray-100 text-gray-700',
}

const SCORE_LABEL = ['', 'Needs Work', 'Below Par', 'Developing', 'Good', 'Excellent'] as const
const scoreBg = (s: number) => s >= 4 ? 'bg-green-500' : s === 3 ? 'bg-amber-500' : 'bg-red-500'
const scoreText = (s: number) => s >= 4 ? 'text-green-600' : s === 3 ? 'text-amber-600' : 'text-red-600'

interface DrillResult {
  question: DrillQuestion
  transcript: string
  score: number
  one_line: string
  missing: string
}

const FILTER_OPTIONS: { value: DrillRoundFilter; label: string }[] = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'tech_l1', label: 'Tech L1' },
  { value: 'tech_l2', label: 'Tech L2' },
  { value: 'managerial', label: 'Managerial' },
  { value: 'hr', label: 'HR' },
]

interface QuestionContext { role: string; company: string }

export default function DrillPage() {
  const today = new Date().toISOString().split('T')[0]
  const [filter, setFilter] = useState<DrillRoundFilter>('mixed')
  const [questions, setQuestions] = useState<DrillQuestion[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const [questionContext, setQuestionContext] = useState<QuestionContext | null>(null)
  const [qIndex, setQIndex] = useState(0)
  const [phase, setPhase] = useState<'intro' | 'answering' | 'scored' | 'done'>('intro')
  const [transcript, setTranscript] = useState('')
  const [listening, setListening] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<DrillResult[]>([])
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const interimRef = useRef('')

  useEffect(() => {
    const cacheKey = `drill-${today}-${filter}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { questions: DrillQuestion[]; context?: QuestionContext }
        setQuestions(parsed.questions)
        setQuestionContext(parsed.context ?? null)
        setLoadingQuestions(false)
        return
      } catch { /* fall through to fetch */ }
    }

    setLoadingQuestions(true)
    fetch('/api/drill-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter }),
    })
      .then(r => r.json())
      .then((data: { questions: DrillQuestion[]; context?: QuestionContext }) => {
        const qs = data.questions?.length ? data.questions : getDailyDrillQuestions(today, filter)
        setQuestions(qs)
        setQuestionContext(data.context ?? null)
        localStorage.setItem(cacheKey, JSON.stringify({ questions: qs, context: data.context }))
      })
      .catch(() => {
        setQuestions(getDailyDrillQuestions(today, filter))
        setQuestionContext(null)
      })
      .finally(() => setLoadingQuestions(false))
  }, [filter, today])

  useEffect(() => {
    if (phase === 'answering') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase, qIndex])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  function startListening() {
    const win = window as unknown as Record<string, unknown>
    type SpeechRecognitionInstance = {
      continuous: boolean; interimResults: boolean; lang: string
      onresult: ((e: { resultIndex: number; results: Array<{ isFinal: boolean } & { [i: number]: { transcript: string } }> }) => void) | null
      onerror: (() => void) | null; onend: (() => void) | null
      start(): void; stop(): void
    }
    const SpeechRec = (win.SpeechRecognition || win.webkitSpeechRecognition) as (new () => SpeechRecognitionInstance) | undefined
    if (!SpeechRec) { alert('Speech recognition is not supported in this browser. Please type your answer.'); return }

    const rec = new SpeechRec()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-IN'
    interimRef.current = ''

    rec.onresult = (e: { resultIndex: number; results: Array<{ isFinal: boolean } & { [i: number]: { transcript: string } }> }) => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalChunk += t + ' '
        else interimChunk += t
      }
      if (finalChunk) {
        setTranscript(prev => (prev + ' ' + finalChunk).trimStart())
        interimRef.current = ''
      } else {
        interimRef.current = interimChunk
        setTranscript(prev => prev)
      }
    }
    rec.onerror = () => stopListening()
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  function toggleMic() {
    if (listening) stopListening()
    else startListening()
  }

  async function submit() {
    if (submitting) return
    stopListening()
    const q = questions[qIndex]
    const answer = transcript.trim()
    setSubmitting(true)
    try {
      const res = await fetch('/api/drill-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: answer || '[No answer provided]',
          question: q.text,
          topic_tag: q.topicTag,
          difficulty: q.difficulty,
        }),
      })
      const data = await res.json()
      setResults(prev => [...prev, { question: q, transcript: answer, score: data.score, one_line: data.one_line, missing: data.missing }])
      setPhase('scored')
    } catch {
      alert('Evaluation failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function nextQuestion() {
    if (qIndex + 1 >= questions.length) {
      setPhase('done')
    } else {
      setQIndex(i => i + 1)
      setTranscript('')
      setElapsed(0)
      setPhase('answering')
    }
  }

  function restart() {
    localStorage.removeItem(`drill-${today}-${filter}`)
    setQIndex(0)
    setTranscript('')
    setElapsed(0)
    setResults([])
    setPhase('intro')
  }

  const avgScore = results.length > 0
    ? Math.round(results.reduce((a, r) => a + r.score, 0) / results.length * 10) / 10
    : 0

  const currentQ = questions[qIndex]
  const currentResult = results[qIndex]

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">Daily Drill</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Free</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* Intro */}
        {phase === 'intro' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-7 h-7 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Daily Drill</h1>
            <p className="text-gray-500 text-sm mb-4">
              3 questions · ~5 minutes · completely free · no credits needed
            </p>

            {questionContext && (
              <div className="inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 mb-4">
                <Sparkles className="w-3 h-3" />
                Personalised for {questionContext.role} at {questionContext.company}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {FILTER_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    filter === f.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left text-sm text-gray-600 space-y-1.5">
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> Speak or type your answer</div>
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> Instant AI evaluation after each answer</div>
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> No interview credit needed — unlimited daily practice</div>
            </div>

            {loadingQuestions ? (
              <div className="flex items-center justify-center gap-2 w-full bg-blue-100 text-blue-400 py-4 rounded-xl font-semibold cursor-not-allowed">
                <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                Generating your questions…
              </div>
            ) : (
              <button
                onClick={() => setPhase('answering')}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                Start Drill <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Answering */}
        {phase === 'answering' && currentQ && (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Question {qIndex + 1} of {questions.length}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {elapsed}s</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${((qIndex) / questions.length) * 100}%` }} />
            </div>

            {/* Question card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROUND_COLORS[currentQ.roundType]}`}>
                  {ROUND_LABELS[currentQ.roundType]}
                </span>
                <span className="text-xs text-gray-400 capitalize">{currentQ.topicTag.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400">Diff {currentQ.difficulty}/5</span>
              </div>
              <p className="text-gray-900 font-medium leading-relaxed text-lg">{currentQ.text}</p>
            </div>

            {/* Answer input */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Type your answer here, or click the mic to speak…"
                rows={5}
                className="w-full text-sm text-gray-800 placeholder-gray-400 resize-none outline-none leading-relaxed"
              />
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  onClick={toggleMic}
                  className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                    listening
                      ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {listening ? <><MicOff className="w-4 h-4" /> Stop mic</> : <><Mic className="w-4 h-4" /> Use mic</>}
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || (!transcript.trim())}
                  className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><ChevronRight className="w-4 h-4" /> Submit</>}
                </button>
              </div>
            </div>

            <button onClick={() => { stopListening(); nextQuestion() }} className="w-full text-sm text-gray-400 hover:text-gray-600 py-2">
              Skip this question →
            </button>
          </div>
        )}

        {/* Scored */}
        {phase === 'scored' && currentResult && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-sm text-gray-500 italic mb-4">&ldquo;{currentResult.question.text}&rdquo;</p>

              <div className="flex items-center gap-4 mb-4">
                <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center text-white flex-shrink-0 ${scoreBg(currentResult.score)}`}>
                  <span className="text-xl font-bold leading-none">{currentResult.score}</span>
                  <span className="text-[10px] opacity-75">/5</span>
                </div>
                <div>
                  <div className={`font-semibold ${scoreText(currentResult.score)}`}>{SCORE_LABEL[currentResult.score]}</div>
                  <p className="text-sm text-gray-700 mt-0.5">{currentResult.one_line}</p>
                </div>
              </div>

              {currentResult.missing && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <span className="text-xs font-semibold text-amber-700">Key point you missed:</span>
                  <p className="text-sm text-amber-800 mt-0.5">{currentResult.missing}</p>
                </div>
              )}

              {currentResult.transcript && (
                <div className="mt-3 bg-gray-50 rounded-lg p-3">
                  <span className="text-xs font-semibold text-gray-500">Your answer:</span>
                  <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">{currentResult.transcript}</p>
                </div>
              )}
            </div>

            <button
              onClick={nextQuestion}
              className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              {qIndex + 1 >= questions.length ? 'See Results' : `Next Question (${qIndex + 2}/${questions.length})`}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center text-white mx-auto mb-4 ${scoreBg(Math.round(avgScore))}`}>
              <span className="text-2xl font-bold leading-none">{avgScore}</span>
              <span className="text-xs opacity-75">/5</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Drill Complete!</h2>
            <p className="text-gray-500 text-sm mb-6">Average score across {results.length} questions</p>

            <div className="space-y-3 mb-6 text-left">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${scoreBg(r.score)}`}>
                    {r.score}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 font-medium truncate">{r.question.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.one_line}</p>
                  </div>
                </div>
              ))}
            </div>

            {avgScore < 3.5 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-left">
                <p className="text-sm text-blue-700 font-medium">Ready to go deeper?</p>
                <p className="text-sm text-blue-600 mt-0.5">A full 30-minute mock interview with voice feedback will pinpoint exactly where to improve.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Link
                href="/interview/setup"
                className="flex items-center justify-center gap-2 bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
              >
                Start Full Interview <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={restart}
                className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Try different questions
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

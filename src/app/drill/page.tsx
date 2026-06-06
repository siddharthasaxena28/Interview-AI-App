'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, ChevronRight, CheckCircle, RotateCcw, Zap, Clock, ArrowRight, Sparkles } from 'lucide-react'
import { getDailyDrillQuestions, type DrillQuestion, type DrillRoundFilter } from '@/lib/drill-questions'

interface DrillQuestionsResponse {
  questions: DrillQuestion[]
  personalized: boolean
  context?: { role: string; company: string }
}
import type { RoundType } from '@/types'

const ROUND_LABELS: Record<RoundType, string> = {
  tech_l1: 'Tech L1',
  tech_l2: 'Tech L2',
  managerial: 'Managerial',
  hr: 'HR',
  full_loop: 'Full Loop',
}

const ROUND_COLORS: Record<RoundType, string> = {
  tech_l1: 'bg-blue-50 text-blue-600 border border-blue-200',
  tech_l2: 'bg-purple-50 text-purple-600 border border-purple-200',
  managerial: 'bg-indigo-50 text-indigo-600 border border-indigo-200',
  hr: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  full_loop: 'bg-gray-100 text-gray-600 border border-gray-200',
}

const SCORE_LABEL = ['', 'Needs Work', 'Below Par', 'Developing', 'Good', 'Excellent'] as const

const scoreBg = (s: number) =>
  s >= 4 ? 'bg-emerald-50 border border-emerald-200 text-emerald-600'
  : s === 3 ? 'bg-amber-50 border border-amber-200 text-amber-600'
  : 'bg-red-50 border border-red-200 text-red-600'

const scoreRing = (s: number) =>
  s >= 4 ? 'ring-4 ring-emerald-200'
  : s === 3 ? 'ring-4 ring-amber-200'
  : 'ring-4 ring-red-200'

const scoreText = (s: number) =>
  s >= 4 ? 'text-emerald-600' : s === 3 ? 'text-amber-600' : 'text-red-600'

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

function DrillPageInner() {
  const searchParams = useSearchParams()
  const urlFilter = searchParams.get('filter') as DrillRoundFilter | null
  // Compute once on mount so midnight doesn't replace questions mid-session
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [filter, setFilter] = useState<DrillRoundFilter>(
    FILTER_OPTIONS.some(f => f.value === urlFilter) ? urlFilter! : 'mixed'
  )
  const [questions, setQuestions] = useState<DrillQuestion[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const [personalized, setPersonalized] = useState(false)
  const [personalizationCtx, setPersonalizationCtx] = useState<{ role: string; company: string } | null>(null)
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

  // Fetch personalized questions from the API (uses role, JD, weak areas).
  // Falls back to static date-seeded questions if the user has no history or the call fails.
  useEffect(() => {
    setLoadingQuestions(true)
    fetch('/api/drill-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter }),
    })
      .then(r => r.json())
      .then((data: DrillQuestionsResponse) => {
        setQuestions(data.questions?.length ? data.questions : getDailyDrillQuestions(today, filter))
        setPersonalized(data.personalized ?? false)
        setPersonalizationCtx(data.context ?? null)
      })
      .catch(() => {
        setQuestions(getDailyDrillQuestions(today, filter))
        setPersonalized(false)
        setPersonalizationCtx(null)
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
    // Only update listening state if this instance is still the active one —
    // prevents a stale onend from a replaced instance setting listening=false
    // while a new recognition is already running.
    rec.onend = () => { if (recognitionRef.current === rec) setListening(false) }
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
    // Include any in-flight interim transcript that speech recognition captured
    // but hadn't yet finalized when the user hit Submit.
    const answer = (transcript + ' ' + interimRef.current).trim()
    interimRef.current = ''
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
      if (!res.ok) throw new Error(data.error ?? 'Evaluation failed')
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

  const timerColor = elapsed >= 270 ? 'text-red-600' : elapsed >= 240 ? 'text-amber-600' : 'text-gray-500'

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-200 px-6 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">Daily Drill</span>
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">Free</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">← Dashboard</Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">

        {/* ── INTRO ── */}
        {phase === 'intro' && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm"
          >
            <div className="w-16 h-16 bg-indigo-100 border border-indigo-300 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Zap className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Daily Drill</h1>

            <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
              <span className="text-xs bg-gray-100 border border-gray-200 text-gray-600 px-3 py-1 rounded-full">3 questions</span>
              <span className="text-xs bg-gray-100 border border-gray-200 text-gray-600 px-3 py-1 rounded-full">~5 minutes</span>
              <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-600 px-3 py-1 rounded-full font-medium">Free — no credits</span>
            </div>

            {loadingQuestions ? (
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mb-5">
                <div className="w-3 h-3 border border-indigo-300 border-t-indigo-500 rounded-full animate-spin" />
                Personalising questions for you…
              </div>
            ) : personalized && personalizationCtx ? (
              <p className="text-xs mb-5 flex items-center justify-center gap-1.5 text-indigo-600">
                <Sparkles className="w-3 h-3" />
                Tailored for <span className="font-semibold">{personalizationCtx.role}</span> at <span className="font-semibold">{personalizationCtx.company}</span>
              </p>
            ) : (
              <p className="text-xs text-gray-400 mb-5 flex items-center justify-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-500" />
                Complete your first mock interview to get questions personalised to your role and weak areas.
              </p>
            )}

            {/* Filter pills */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {FILTER_OPTIONS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    filter === f.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Checklist */}
            <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 mb-6 text-left space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" /> Speak or type your answer
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" /> Instant AI evaluation after each answer
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" /> No interview credit needed — unlimited daily practice
              </div>
            </div>

            <button
              onClick={() => setPhase('answering')}
              disabled={loadingQuestions}
              className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.97] disabled:opacity-50 text-white py-4 rounded-xl font-semibold transition-all"
            >
              {loadingQuestions
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Loading questions…</>
                : <>Start Drill <ChevronRight className="w-4 h-4" /></>}
            </button>
          </motion.div>
        )}

        {/* ── ANSWERING ── */}
        {phase === 'answering' && currentQ && (
          <motion.div
            key={`answering-${qIndex}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="space-y-4"
          >
            {/* Top progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-indigo-600 h-1 rounded-full transition-all"
                style={{ width: `${((qIndex) / questions.length) * 100}%` }}
              />
            </div>

            {/* Counter + timer row */}
            <div className="flex items-center justify-between">
              <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1 rounded-full font-semibold">
                Q{qIndex + 1} / {questions.length}
              </span>
              <span className={`flex items-center gap-1.5 text-sm font-mono tabular-nums ${timerColor}`}>
                <Clock className="w-3.5 h-3.5" /> {elapsed}s
              </span>
            </div>

            {/* Question card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${ROUND_COLORS[currentQ.roundType]}`}>
                  {ROUND_LABELS[currentQ.roundType]}
                </span>
                <span className="text-xs text-gray-400 capitalize">{currentQ.topicTag.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400">Diff {currentQ.difficulty}/5</span>
              </div>
              <p className="text-gray-900 font-medium leading-relaxed text-xl">{currentQ.text}</p>
            </div>

            {/* Answer input */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Type your answer here, or click the mic to speak…"
                rows={5}
                className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 resize-none outline-none leading-relaxed"
              />
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                {/* Mic button */}
                <button
                  onClick={toggleMic}
                  className={`relative flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl transition-all ${
                    listening
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                      : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {listening && (
                    <span className="absolute inset-0 rounded-xl bg-red-500 animate-ping opacity-30" />
                  )}
                  {listening
                    ? <><MicOff className="w-4 h-4" /> Stop mic</>
                    : <><Mic className="w-4 h-4" /> Use mic</>
                  }
                </button>

                <button
                  onClick={submit}
                  disabled={submitting || (!transcript.trim())}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.97] disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                >
                  {submitting
                    ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <><ChevronRight className="w-4 h-4" /> Submit</>}
                </button>
              </div>
            </div>

            <button
              onClick={() => { stopListening(); nextQuestion() }}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors"
            >
              Skip this question →
            </button>
          </motion.div>
        )}

        {/* ── SCORED ── */}
        {phase === 'scored' && currentResult && (
          <motion.div
            key={`scored-${qIndex}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="space-y-4"
          >
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-sm">
              <p className="text-sm text-gray-500 italic">&ldquo;{currentResult.question.text}&rdquo;</p>

              {/* Score display */}
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${scoreBg(currentResult.score)} ${scoreRing(currentResult.score)}`}>
                  <span className="text-2xl font-bold leading-none">{currentResult.score}</span>
                  <span className="text-[10px] opacity-70">/5</span>
                </div>
                <div>
                  <div className={`font-semibold text-lg ${scoreText(currentResult.score)}`}>
                    {SCORE_LABEL[currentResult.score]}
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5">{currentResult.one_line}</p>
                </div>
              </div>

              {/* Missing key point */}
              {currentResult.missing && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Key point you missed</span>
                  <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{currentResult.missing}</p>
                </div>
              )}

              {/* Transcript */}
              {currentResult.transcript && (
                <details className="group">
                  <summary className="text-xs font-semibold text-gray-400 hover:text-gray-600 cursor-pointer transition-colors list-none flex items-center gap-1.5">
                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                    Your answer
                  </summary>
                  <div className="mt-2 bg-slate-50 border border-gray-200 rounded-xl p-3">
                    <p className="text-sm text-gray-600 leading-relaxed">{currentResult.transcript}</p>
                  </div>
                </details>
              )}
            </div>

            <button
              onClick={nextQuestion}
              className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.97] text-white py-4 rounded-xl font-semibold transition-all"
            >
              {qIndex + 1 >= questions.length ? 'See Results' : `Next Question (${qIndex + 2}/${questions.length})`}
              <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm"
          >
            {/* Average score ring */}
            <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center mx-auto mb-5 ${scoreBg(Math.round(avgScore))} ${scoreRing(Math.round(avgScore))}`}>
              <span className="text-3xl font-bold leading-none">{avgScore}</span>
              <span className="text-xs opacity-70">/5</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Drill Complete!</h2>
            <p className="text-gray-500 text-sm mb-7">Average score across {results.length} questions</p>

            {/* Per-question results */}
            <div className="space-y-3 mb-7 text-left">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-gray-200">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${scoreBg(r.score)}`}>
                    {r.score}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 font-medium truncate">{r.question.text}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.one_line}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA for full interview */}
            {avgScore < 3.5 && (
              <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-300 rounded-2xl p-5 mb-5 text-left">
                <p className="text-sm text-gray-900 font-semibold mb-1">Ready to go deeper?</p>
                <p className="text-sm text-gray-600">A full 30-minute mock interview with voice feedback will pinpoint exactly where to improve.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Link
                href="/interview/setup"
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.97] text-white py-3.5 rounded-xl font-semibold text-sm transition-all"
              >
                Start Full Interview <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={restart}
                className="flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Try different questions
              </button>
            </div>
          </motion.div>
        )}

        </AnimatePresence>
      </main>
    </div>
  )
}

export default function DrillPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    }>
      <DrillPageInner />
    </Suspense>
  )
}

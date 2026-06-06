'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, MessageSquare, Lightbulb, Copy, Check, Play, Square, Mic, RotateCcw, Zap } from 'lucide-react'
import type { PerQuestionFeedback } from '@/types'
import { getAnswerAudio } from '@/lib/audio-storage'

const IDEAL_WORDS: Record<string, [number, number]> = {
  system_design: [150, 400], architecture: [150, 400], scalability: [150, 350],
  distributed_systems: [150, 350], trade_offs: [100, 300],
  leadership: [100, 250], team_management: [100, 250], conflict_resolution: [100, 250],
  stakeholder_management: [100, 250], decision_making: [100, 250],
  behavioral: [100, 250], ownership: [100, 250], mentoring: [100, 250],
  salary_negotiation: [50, 150], notice_period: [30, 100], culture_fit: [60, 150],
  motivation: [60, 150], career_goals: [60, 150],
}
const DEFAULT_IDEAL: [number, number] = [80, 200]

function getIdealWords(topicTag: string): [number, number] {
  return IDEAL_WORDS[topicTag] ?? DEFAULT_IDEAL
}

const TOPIC_ROUND: Record<string, string> = {
  fundamentals: 'tech_l1', data_structures: 'tech_l1', algorithms: 'tech_l1',
  networking: 'tech_l1', code_quality: 'tech_l1', debugging: 'tech_l1',
  language_concepts: 'tech_l1', problem_solving: 'tech_l1', system_basics: 'tech_l1',
  system_design: 'tech_l2', architecture: 'tech_l2', scalability: 'tech_l2',
  distributed_systems: 'tech_l2', performance: 'tech_l2', databases: 'tech_l2',
  security: 'tech_l2', trade_offs: 'tech_l2', technical_depth: 'tech_l2',
  leadership: 'managerial', team_management: 'managerial', conflict_resolution: 'managerial',
  stakeholder_management: 'managerial', decision_making: 'managerial', project_delivery: 'managerial',
  mentoring: 'managerial', strategy: 'managerial', ownership: 'managerial',
  motivation: 'hr', culture_fit: 'hr', career_goals: 'hr', salary_negotiation: 'hr',
  notice_period: 'hr', work_style: 'hr', company_research: 'hr', strengths_weaknesses: 'hr', behavioral: 'hr',
}

interface QuestionRow {
  id: string
  text: string
  difficulty: number
  topic_tag: string
  expected_keywords?: string[]
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
  sessionId: string
}

const SCORE_LABEL = ['', 'Needs Work', 'Below Par', 'Developing', 'Good', 'Excellent'] as const
const scoreBadgeBg = (s: number) => s >= 4 ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : s === 3 ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-red-100 text-red-600 border border-red-200'
const scoreTextColor = (s: number) => s >= 4 ? 'text-emerald-600' : s === 3 ? 'text-amber-600' : 'text-red-600'

// Speech metrics
const FILLER_WORDS = ['um', 'uh', 'hmm', 'err', 'you know', 'i mean', 'kind of', 'sort of', 'basically']

function calcSpeechMetrics(transcript: string, durationSeconds: number) {
  const words = transcript.trim().split(/\s+/).filter(Boolean)
  const wpm = durationSeconds > 8 ? Math.round((words.length / durationSeconds) * 60) : null
  const lower = transcript.toLowerCase()
  const found: string[] = []
  let fillerCount = 0
  for (const f of FILLER_WORDS) {
    const re = new RegExp(`\\b${f.replace(' ', '\\s+')}\\b`, 'gi')
    const matches = lower.match(re)
    if (matches && matches.length > 0) {
      fillerCount += matches.length
      found.push(`"${f}" ×${matches.length}`)
    }
  }
  return { wpm, fillerCount, wordCount: words.length, fillerDetails: found }
}

function wpmColor(wpm: number) {
  if (wpm < 80) return 'text-red-600'
  if (wpm > 180) return 'text-amber-600'
  return 'text-emerald-600'
}

function wpmLabel(wpm: number) {
  if (wpm < 80) return 'too slow'
  if (wpm > 180) return 'too fast'
  return 'good pace'
}

// Per-question audio playback — loads from IndexedDB if this session's audio was recorded
function AnswerAudio({ sessionId, questionId }: { sessionId: string; questionId: string }) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    getAnswerAudio(sessionId, questionId)
      .then(b => setBlob(b))
      .catch(() => {})
  }, [sessionId, questionId])

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      audioRef.current?.pause()
    }
  }, [])

  if (!blob) return null

  function toggle() {
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = URL.createObjectURL(blob!)
    const audio = new Audio(urlRef.current)
    audioRef.current = audio
    audio.onended = () => setPlaying(false)
    audio.onerror = () => setPlaying(false)
    audio.play().catch(() => setPlaying(false))
    setPlaying(true)
  }

  return (
    <button
      onClick={toggle}
      title={playing ? 'Stop playback' : 'Play your recorded answer'}
      className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-300 hover:border-indigo-400 bg-indigo-50 rounded-lg px-2.5 py-1 transition-colors"
    >
      {playing
        ? <><Square className="w-3 h-3 fill-current" /> Stop</>
        : <><Play className="w-3 h-3 fill-current" /> Play recording</>}
    </button>
  )
}

export default function FeedbackPerQuestion({ perQuestion, questions, answers, sessionId }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

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
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="space-y-2">
        {perQuestion.map((pq, i) => {
          const q = questions[i]
          const a = aMap.get(q?.id ?? pq.question_id)
          const open = expanded.has(i)
          const metrics = a?.transcript_text ? calcSpeechMetrics(a.transcript_text, a.duration_seconds) : null

          return (
            <div key={i} className="rounded-xl border border-gray-200 bg-slate-50 overflow-hidden">
              {/* Header row */}
              <button
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-100 transition-colors"
                onClick={() => toggle(i)}
              >
                <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center ${scoreBadgeBg(pq.score)}`}>
                  <span className="text-base font-bold leading-none">{pq.score}</span>
                  <span className="text-[9px] opacity-75 mt-0.5">/5</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-500 font-medium">Q{i + 1}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize border border-gray-200">
                      {q?.topic_tag?.replace(/_/g, ' ') ?? 'general'}
                    </span>
                    <span className="text-xs text-gray-400">Diff {q?.difficulty ?? '?'}/5</span>
                    {q?.expected_keywords?.includes('__resume') && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">
                        From résumé
                      </span>
                    )}
                    <span className={`text-xs font-semibold ${scoreTextColor(pq.score)}`}>
                      {SCORE_LABEL[pq.score] ?? ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 font-medium truncate">{q?.text ?? 'Question'}</p>
                </div>

                <div className="flex-shrink-0 text-gray-400">
                  {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* Expanded detail */}
              {open && (
                <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-3">
                  <p className="text-sm text-gray-600 italic leading-relaxed">
                    &ldquo;{q?.text ?? 'Question'}&rdquo;
                  </p>

                  {/* Answer transcript */}
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-xs font-semibold text-indigo-700">Your answer</span>
                        {a && a.duration_seconds > 0 && (
                          <span className="text-xs text-indigo-600">{Math.round(a.duration_seconds)}s</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {q && <AnswerAudio sessionId={sessionId} questionId={q.id} />}
                        {a?.transcript_text && (
                          <button
                            onClick={() => copyText(a.transcript_text, `ans-${i}`)}
                            className="text-indigo-600 hover:text-indigo-700 transition-colors"
                            title="Copy answer"
                          >
                            {copied === `ans-${i}`
                              ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {a?.transcript_text ? (
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{a.transcript_text}</p>
                    ) : (
                      <p className="text-sm text-indigo-600 italic">No answer recorded for this question.</p>
                    )}
                  </div>

                  {/* Speech metrics */}
                  {metrics && (metrics.wpm !== null || metrics.fillerCount > 0) && (
                    <div className="rounded-lg border border-gray-200 bg-gray-100 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Mic className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-600">Speech metrics</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs">
                        {metrics.wpm !== null && (
                          <div>
                            <span className="text-gray-500">Pace: </span>
                            <span className={`font-semibold ${wpmColor(metrics.wpm)}`}>
                              {metrics.wpm} WPM
                            </span>
                            <span className="text-gray-400 ml-1">· {wpmLabel(metrics.wpm)} (ideal 100–160)</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">Words: </span>
                          <span className="font-semibold text-gray-700">{metrics.wordCount}</span>
                        </div>
                        {(() => {
                          if (!q?.topic_tag) return null
                          const [min, max] = getIdealWords(q.topic_tag)
                          const wc = metrics.wordCount
                          const tooShort = wc < min * 0.7
                          const tooLong = wc > max * 1.3
                          if (tooShort || tooLong) {
                            return (
                              <div>
                                <span className="text-gray-500">Ideal length: </span>
                                <span className={`font-semibold ${tooShort ? 'text-red-600' : tooLong ? 'text-amber-600' : 'text-gray-700'}`}>
                                  {min}–{max} words
                                </span>
                                <span className={`ml-1 ${tooShort ? 'text-red-600' : 'text-amber-600'}`}>
                                  ({tooShort ? `too short — expand by ${min - wc}+ words` : `consider trimming to ${max} words`})
                                </span>
                              </div>
                            )
                          }
                          return null
                        })()}
                        {metrics.fillerCount > 0 && (
                          <div>
                            <span className="text-gray-500">Filler words: </span>
                            <span className={`font-semibold ${metrics.fillerCount > 3 ? 'text-amber-600' : 'text-gray-700'}`}>
                              {metrics.fillerCount}
                            </span>
                            <span className="text-gray-400 ml-1">({metrics.fillerDetails.slice(0, 3).join(', ')})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Coach feedback */}
                  <div className="rounded-lg border border-gray-200 bg-gray-100 p-3">
                    <span className="text-xs font-semibold text-gray-600 block mb-1.5">Coach Feedback</span>
                    <p className="text-sm text-gray-700 leading-relaxed">{pq.feedback}</p>
                  </div>

                  {/* Ideal answer hint */}
                  {pq.ideal_answer_hint && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-xs font-semibold text-indigo-700">What a strong answer covers</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                        {pq.ideal_answer_hint}
                      </p>
                    </div>
                  )}

                  {/* Retry This Topic CTA */}
                  {pq.score <= 3 && q?.topic_tag && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={`/drill?filter=${TOPIC_ROUND[q.topic_tag] ?? 'tech_l1'}`}
                        className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        <Zap className="w-3 h-3" />
                        Drill {q.topic_tag.replace(/_/g, ' ')} — free
                      </a>
                      <a
                        href={`/interview/setup?round_type=${TOPIC_ROUND[q.topic_tag] ?? 'tech_l1'}`}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 font-medium transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Full interview →
                      </a>
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

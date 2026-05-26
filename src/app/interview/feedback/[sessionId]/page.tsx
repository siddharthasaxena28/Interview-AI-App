import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProbabilityLabel } from '@/lib/utils'
import { getRoundLabel } from '@/lib/personas'
import { CheckCircle, AlertCircle, Share2, RotateCcw, Mic, TrendingUp } from 'lucide-react'
import type { FeedbackReport, InterviewSession, StrengthItem, GapItem, PerQuestionFeedback, CommunicationFeedback, RoundType } from '@/types'
import FeedbackClient from './FeedbackClient'
import ScoreCard from './ScoreCard'
import ScoreRing from './ScoreRing'
import FeedbackPerQuestion from './FeedbackPerQuestion'
import AppFeedbackWidget from './AppFeedbackWidget'

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: session } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) notFound()

  const [
    { data: report },
    { data: questions },
    { data: answers },
  ] = await Promise.all([
    supabase.from('feedback_reports').select('*').eq('session_id', sessionId).single(),
    supabase.from('questions').select('id, text, difficulty, topic_tag').eq('session_id', sessionId).eq('asked', true).order('order_index'),
    supabase.from('answers').select('question_id, transcript_text, duration_seconds').eq('session_id', sessionId),
  ])

  const s = session as InterviewSession
  const r = report as FeedbackReport | null

  if (!r) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Generating your feedback report...</p>
          <p className="text-sm text-gray-400 mt-1">This takes about 30 seconds</p>
          <FeedbackClient sessionId={sessionId} hasReport={false} />
        </div>
      </div>
    )
  }

  const strengths: StrengthItem[] = (r.strengths_json as StrengthItem[]) ?? []
  const gaps: GapItem[] = (r.gaps_json as GapItem[]) ?? []
  const perQuestion: PerQuestionFeedback[] = (r.per_question_json as PerQuestionFeedback[]) ?? []
  const commJson: CommunicationFeedback | null = (r.communication_json as CommunicationFeedback | null) ?? null

  const questionList = (questions ?? []) as Array<{ id: string; text: string; difficulty: number; topic_tag: string }>
  const answerList = (answers ?? []) as Array<{ question_id: string; transcript_text: string; duration_seconds: number }>

  // Aggregate per-question scores by topic for the performance chart
  const topicMap = new Map(questionList.map(q => [q.id, q]))
  const topicPerf = new Map<string, { total: number; count: number }>()
  for (const pq of perQuestion) {
    const q = topicMap.get(pq.question_id)
    if (!q) continue
    const cur = topicPerf.get(q.topic_tag) ?? { total: 0, count: 0 }
    topicPerf.set(q.topic_tag, { total: cur.total + pq.score, count: cur.count + 1 })
  }
  const topicData = Array.from(topicPerf.entries())
    .map(([tag, { total, count }]) => ({ tag, avg: total / count }))
    .sort((a, b) => b.avg - a.avg)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const shareUrl = `${appUrl}/report/${r.share_token}`

  // Interview date
  const interviewDate = s.started_at
    ? new Date(s.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  // Communication dimensions config
  const commDimensions = commJson
    ? [
        { label: 'Clarity', score: commJson.clarity, note: commJson.clarity_note },
        { label: 'Pacing', score: commJson.pacing, note: commJson.pacing_note },
        { label: 'Confidence', score: commJson.confidence, note: commJson.confidence_note },
        { label: 'Filler Words', score: commJson.filler_words, note: commJson.filler_note },
      ]
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Dashboard
          </Link>
        </div>
      </nav>

      <FeedbackClient
        sessionId={sessionId}
        hasReport={true}
        overallScore={r.overall_score}
        selectionProbability={r.selection_probability}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="text-center">
          <div className="text-sm text-gray-500 mb-1">
            {s.company} — {s.role} · {getRoundLabel(s.round_type as RoundType)}
            {interviewDate && <span className="text-gray-400"> · {interviewDate}</span>}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Your Interview Report</h1>
        </div>

        {/* ── 3 Score rings ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <div className="grid grid-cols-3 gap-4 sm:gap-8 justify-items-center">
            <ScoreRing
              score={r.overall_score}
              label="Overall Score"
              sublabel="Performance"
            />
            <ScoreRing
              score={r.selection_probability}
              format="percent"
              label="Selection Chance"
              sublabel={getProbabilityLabel(r.selection_probability)}
            />
            <ScoreRing
              score={r.communication_score}
              label="Communication"
              sublabel="Delivery & Clarity"
            />
          </div>
        </div>

        {/* ── Overall assessment ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Overall Assessment</h2>
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{r.report_text}</p>
        </div>

        {/* ── Strengths + Focus Areas ─────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Strengths */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> Top Strengths
            </h2>
            <div className="space-y-3">
              {strengths.map((str, i) => (
                <div key={i} className="bg-green-50 border border-green-100 rounded-xl p-3.5">
                  <div className="font-semibold text-green-800 text-sm mb-1">{str.title}</div>
                  {str.example && (
                    <p className="text-green-700 text-xs italic mb-1.5 leading-relaxed">&ldquo;{str.example}&rdquo;</p>
                  )}
                  <p className="text-green-700 text-xs leading-relaxed">{str.advice}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Focus Areas */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" /> Focus Areas
            </h2>
            <div className="space-y-3">
              {gaps.map((g, i) => (
                <div key={i} className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                  <div className="font-semibold text-amber-800 text-sm mb-1">{g.title}</div>
                  {g.example && (
                    <p className="text-amber-700 text-xs italic mb-1.5 leading-relaxed">&ldquo;{g.example}&rdquo;</p>
                  )}
                  <p className="text-amber-700 text-xs leading-relaxed">{g.advice}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Communication quality ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Communication Quality</h2>
            <span className={`text-sm font-bold ${r.communication_score >= 80 ? 'text-green-600' : r.communication_score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {r.communication_score}/100
            </span>
          </div>

          {commDimensions ? (
            <div className="space-y-4">
              {commDimensions.map(dim => (
                <div key={dim.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{dim.label}</span>
                    <span className={`text-sm font-bold ${dim.score >= 80 ? 'text-green-600' : dim.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {dim.score}/100
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                    <div
                      className={`h-2 rounded-full transition-all ${dim.score >= 80 ? 'bg-green-500' : dim.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  {dim.note && (
                    <p className="text-xs text-gray-500 leading-relaxed">{dim.note}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Fallback for older reports without communication_json */
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${r.communication_score >= 80 ? 'bg-green-500' : r.communication_score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${r.communication_score}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Topic performance ───────────────────────────────────────── */}
        {topicData.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Performance by Topic
            </h2>
            <div className="space-y-3">
              {topicData.map(({ tag, avg }) => {
                const pct = (avg / 5) * 100
                return (
                  <div key={tag}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 capitalize">{tag.replace(/_/g, ' ')}</span>
                      <span className={`text-sm font-semibold ${avg >= 4 ? 'text-green-600' : avg >= 3 ? 'text-amber-600' : 'text-red-600'}`}>
                        {avg.toFixed(1)}/5
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${avg >= 4 ? 'bg-green-500' : avg >= 3 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Per-question accordion ──────────────────────────────────── */}
        {perQuestion.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <FeedbackPerQuestion
              perQuestion={perQuestion}
              questions={questionList}
              answers={answerList}
              sessionId={sessionId}
            />
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/interview/setup"
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors flex-1"
          >
            <RotateCcw className="w-4 h-4" /> Practice Again
          </Link>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700 px-6 py-3 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            <Share2 className="w-4 h-4" /> Share Report
          </a>
        </div>

        {/* ── Score card download / LinkedIn share ────────────────────── */}
        <ScoreCard
          company={s.company}
          role={s.role}
          roundLabel={getRoundLabel(s.round_type as RoundType)}
          overallScore={r.overall_score}
          selectionProbability={r.selection_probability}
          appUrl={appUrl}
          shareUrl={shareUrl}
        />

        {/* ── App experience feedback ─────────────────────────────────── */}
        <AppFeedbackWidget sessionId={sessionId} />

      </main>
    </div>
  )
}

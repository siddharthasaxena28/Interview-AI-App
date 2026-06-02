import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getProbabilityLabel } from '@/lib/utils'
import { getRoundLabel } from '@/lib/personas'
import { CheckCircle, AlertCircle, Share2, RotateCcw, Mic, TrendingUp, ArrowLeft } from 'lucide-react'
import type { FeedbackReport, InterviewSession, StrengthItem, GapItem, PerQuestionFeedback, CommunicationFeedback, RoundType } from '@/types'
import FeedbackClient from './FeedbackClient'
import ScoreCard from './ScoreCard'
import ScoreRing from './ScoreRing'
import FeedbackPerQuestion from './FeedbackPerQuestion'
import AppFeedbackWidget from './AppFeedbackWidget'
import CoachChat from './CoachChat'

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
      <div className="min-h-screen bg-[#0a0a0f]">
        <nav className="bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4 sticky top-0 z-20">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Mic className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-white">InterviewAI</span>
            </div>
            <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-indigo-400 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Link>
          </div>
        </nav>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-white/10 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-semibold">Generating your feedback report…</p>
            <FeedbackClient sessionId={sessionId} hasReport={false} />
          </div>
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

  const interviewDate = s.started_at
    ? new Date(s.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const commDimensions = commJson
    ? [
        { label: 'Clarity', score: commJson.clarity, note: commJson.clarity_note },
        { label: 'Pacing', score: commJson.pacing, note: commJson.pacing_note },
        { label: 'Confidence', score: commJson.confidence, note: commJson.confidence_note },
        { label: 'Filler Words', score: commJson.filler_words, note: commJson.filler_note },
      ]
    : null

  const benchmark: Record<string, number> = {
    tech_l1: 55, tech_l2: 52, managerial: 54, hr: 62, full_loop: 53,
  }
  const benchmarkAvg = benchmark[s.round_type as string] ?? 55
  const benchmarkDiff = r.selection_probability - benchmarkAvg

  return (
    <div className="min-h-screen bg-[#0a0a0f]">

      {/* Nav */}
      <nav className="bg-[#0a0a0f]/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-indigo-400 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </nav>

      <FeedbackClient
        sessionId={sessionId}
        hasReport={true}
        overallScore={r.overall_score}
        selectionProbability={r.selection_probability}
      />

      {/* Hero dark banner */}
      <div className="bg-gradient-to-br from-[#0a0a0f] via-[#0d0d1a] to-[#0f0a1e] px-6 pt-10 pb-20 text-center border-b border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
            <span className="text-gray-300 text-sm font-medium">{s.company}</span>
            <span className="text-gray-600 text-sm">—</span>
            <span className="text-gray-300 text-sm">{s.role}</span>
            <span className="bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-indigo-500/30">
              {getRoundLabel(s.round_type as RoundType)}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Interview Report</h1>
          {interviewDate && (
            <p className="text-gray-500 text-sm mt-2">{interviewDate}</p>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 space-y-5 -mt-12 relative">

        {/* Score rings — overlaps hero */}
        <div className="bg-[#111118] border border-white/[0.06] rounded-2xl shadow-2xl p-6 sm:p-8">
          <div className="grid grid-cols-3 gap-4 sm:gap-8 justify-items-center">
            <ScoreRing
              score={r.overall_score}
              label="Overall Score"
              sublabel="Performance"
              size={130}
            />
            <ScoreRing
              score={r.selection_probability}
              format="percent"
              label="Selection Chance"
              sublabel={getProbabilityLabel(r.selection_probability)}
              size={130}
            />
            <ScoreRing
              score={r.communication_score}
              label="Communication"
              sublabel="Delivery & Clarity"
              size={130}
            />
          </div>

          <div className="mt-6 pt-5 border-t border-white/[0.06] flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-gray-500">
              Industry average for {getRoundLabel(s.round_type as RoundType)}:
            </span>
            <span className="text-xs font-semibold text-gray-300">{benchmarkAvg}%</span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
              benchmarkDiff >= 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-amber-500/10 text-amber-400'
            }`}>
              {benchmarkDiff >= 0
                ? `↑ +${benchmarkDiff}% above average`
                : `↓ ${benchmarkDiff}% below average`}
            </span>
          </div>
        </div>

        {/* Overall assessment */}
        <div className="bg-[#111118] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-indigo-500/60 to-purple-500/60" />
          <div className="p-6 sm:p-7">
            <h2 className="font-semibold text-white mb-4">Overall Assessment</h2>
            <p className="text-gray-400 text-sm leading-7 whitespace-pre-wrap">{r.report_text}</p>
          </div>
        </div>

        {/* Strengths + Focus Areas */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* Strengths */}
          <div className="bg-[#111118] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="h-px bg-gradient-to-r from-emerald-500/60 to-green-500/60" />
            <div className="p-5">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" /> Top Strengths
              </h2>
              <div className="space-y-3">
                {strengths.map((str, i) => (
                  <div key={i} className="flex gap-3 p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-emerald-300 text-sm mb-0.5">{str.title}</div>
                      {str.example && (
                        <p className="text-emerald-400/70 text-xs italic mb-1.5 leading-relaxed">&ldquo;{str.example}&rdquo;</p>
                      )}
                      <p className="text-emerald-400/80 text-xs leading-relaxed">{str.advice}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Focus Areas */}
          <div className="bg-[#111118] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="h-px bg-gradient-to-r from-amber-500/60 to-orange-500/60" />
            <div className="p-5">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" /> Focus Areas
              </h2>
              <div className="space-y-3">
                {gaps.map((g, i) => (
                  <div key={i} className="flex gap-3 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-amber-300 text-sm mb-0.5">{g.title}</div>
                      {g.example && (
                        <p className="text-amber-400/70 text-xs italic mb-1.5 leading-relaxed">&ldquo;{g.example}&rdquo;</p>
                      )}
                      <p className="text-amber-400/80 text-xs leading-relaxed">{g.advice}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Communication quality */}
        <div className="bg-[#111118] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-sky-500/60 to-indigo-500/60" />
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-white">Communication Quality</h2>
              <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${
                r.communication_score >= 80
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : r.communication_score >= 60
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-red-500/10 text-red-400'
              }`}>
                {r.communication_score}/100
              </span>
            </div>
            {commDimensions ? (
              <div className="space-y-4">
                {commDimensions.map(dim => (
                  <div key={dim.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-300">{dim.label}</span>
                      <span className={`text-xs font-bold ${
                        dim.score >= 80 ? 'text-emerald-400' : dim.score >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {dim.score}/100
                      </span>
                    </div>
                    <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${
                          dim.score >= 80 ? 'bg-emerald-500' : dim.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    {dim.note && (
                      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{dim.note}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    r.communication_score >= 80 ? 'bg-emerald-500' : r.communication_score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${r.communication_score}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Topic performance */}
        {topicData.length > 1 && (
          <div className="bg-[#111118] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="h-px bg-gradient-to-r from-purple-500/60 to-indigo-500/60" />
            <div className="p-5 sm:p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" /> Performance by Topic
              </h2>
              <div className="space-y-3">
                {topicData.map(({ tag, avg }) => {
                  const pct = (avg / 5) * 100
                  return (
                    <div key={tag}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-gray-300 capitalize">{tag.replace(/_/g, ' ')}</span>
                        <span className={`text-xs font-semibold ${
                          avg >= 4 ? 'text-emerald-400' : avg >= 3 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {avg.toFixed(1)}/5
                        </span>
                      </div>
                      <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${
                            avg >= 4 ? 'bg-emerald-500' : avg >= 3 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Per-question breakdown */}
        {perQuestion.length > 0 && (
          <div className="bg-[#111118] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="h-px bg-gradient-to-r from-gray-600/60 to-gray-500/40" />
            <div className="p-5">
              <FeedbackPerQuestion
                perQuestion={perQuestion}
                questions={questionList}
                answers={answerList}
                sessionId={sessionId}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/interview/setup"
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors flex-1 shadow-lg shadow-indigo-500/20"
          >
            <RotateCcw className="w-4 h-4" /> Practice Again
          </Link>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border border-white/[0.08] bg-white/[0.03] text-gray-300 px-6 py-3 rounded-xl font-semibold text-sm hover:bg-white/[0.06] hover:border-white/[0.12] transition-colors"
          >
            <Share2 className="w-4 h-4" /> Share Report
          </a>
        </div>

        {/* Score card download / LinkedIn share */}
        <ScoreCard
          company={s.company}
          role={s.role}
          roundLabel={getRoundLabel(s.round_type as RoundType)}
          overallScore={r.overall_score}
          selectionProbability={r.selection_probability}
          appUrl={appUrl}
          shareUrl={shareUrl}
        />

        {/* AI Interview Coach */}
        <CoachChat sessionId={sessionId} />

        {/* App experience feedback */}
        <AppFeedbackWidget sessionId={sessionId} />

      </main>
    </div>
  )
}

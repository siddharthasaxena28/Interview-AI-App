import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getScoreColor, getScoreBg, getProbabilityLabel } from '@/lib/utils'
import { getRoundLabel } from '@/lib/personas'
import { CheckCircle, AlertCircle, ChevronDown, Share2, RotateCcw, Mic } from 'lucide-react'
import type { FeedbackReport, InterviewSession, StrengthItem, GapItem, PerQuestionFeedback, RoundType } from '@/types'
import FeedbackClient from './FeedbackClient'

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

  const { data: report } = await supabase
    .from('feedback_reports')
    .select('*')
    .eq('session_id', sessionId)
    .single()
  // If report isn't ready yet, FeedbackClient polls every 5 s via router.refresh()
  // and retries generation from the browser (which has the real auth cookie).

  const s = session as InterviewSession
  const r = report as FeedbackReport | null

  const strengths: StrengthItem[] = (r?.strengths_json as StrengthItem[]) ?? []
  const gaps: GapItem[] = (r?.gaps_json as GapItem[]) ?? []
  const perQuestion: PerQuestionFeedback[] = (r?.per_question_json as PerQuestionFeedback[]) ?? []

  const { data: questions } = await supabase
    .from('questions')
    .select('id, text, difficulty, topic_tag')
    .eq('session_id', sessionId)
    .eq('asked', true)
    .order('order_index')

  const questionMap = new Map(
    (questions ?? []).map((q: { id: string; text: string; difficulty: number; topic_tag: string }) => [q.id, q])
  )

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const shareUrl = `${appUrl}/report/${r.share_token}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">
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

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-sm text-gray-500 mb-1">
            {s.company} — {s.role} · {getRoundLabel(s.round_type as RoundType)}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Your Interview Report</h1>
        </div>

        {/* Score + probability */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className={`text-6xl font-bold mb-2 ${getScoreColor(r.overall_score)}`}>
              {r.overall_score}
            </div>
            <div className="text-gray-500 text-sm">Overall Score / 100</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className={`text-5xl font-bold mb-2 ${getScoreColor(r.selection_probability)}`}>
              {r.selection_probability}%
            </div>
            <div className="text-gray-500 text-sm">Chance of Selection</div>
            <div className={`mt-2 text-sm font-medium ${getScoreColor(r.selection_probability)}`}>
              {getProbabilityLabel(r.selection_probability)}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Overall Assessment</h2>
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{r.report_text}</p>
        </div>

        {/* Strengths */}
        {strengths.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" /> Top Strengths
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {strengths.map((s, i) => (
                <div key={i} className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="font-semibold text-green-800 text-sm mb-1">{s.title}</div>
                  {s.example && (
                    <p className="text-green-700 text-xs italic mb-2">&ldquo;{s.example}&rdquo;</p>
                  )}
                  <p className="text-green-700 text-xs">{s.advice}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gaps */}
        {gaps.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" /> Areas to Improve
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {gaps.map((g, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="font-semibold text-amber-800 text-sm mb-1">{g.title}</div>
                  {g.example && (
                    <p className="text-amber-700 text-xs italic mb-2">&ldquo;{g.example}&rdquo;</p>
                  )}
                  <p className="text-amber-700 text-xs">{g.advice}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Communication */}
        {r.communication_score > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Communication Quality</h2>
              <span className={`text-lg font-bold ${getScoreColor(r.communication_score)}`}>
                {r.communication_score}/100
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className={`h-2 rounded-full ${r.communication_score >= 80 ? 'bg-green-500' : r.communication_score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${r.communication_score}%` }}
              />
            </div>
          </div>
        )}

        {/* Per-question breakdown */}
        {perQuestion.length > 0 && (
          <div className="mb-8">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ChevronDown className="w-5 h-5 text-gray-400" /> Per-Question Breakdown
            </h2>
            <div className="space-y-3">
              {perQuestion.map((pq, i) => {
                const q = questionMap.get(pq.question_id)
                return (
                  <div key={i} className={`bg-white rounded-xl border p-4 ${getScoreBg(pq.score * 20)}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 mb-1">Q{i + 1} · {q?.topic_tag ?? 'general'}</div>
                        <p className="text-sm text-gray-900 font-medium mb-2">{q?.text ?? 'Question'}</p>
                        <p className="text-sm text-gray-600">{pq.feedback}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className={`text-lg font-bold ${getScoreColor(pq.score * 20)}`}>{pq.score}/5</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
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
      </main>
    </div>
  )
}

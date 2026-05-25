import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Mic, Plus, Clock, TrendingUp, CreditCard, LogOut, Flame, Target, Gift, ArrowRight } from 'lucide-react'
import type { User, InterviewSession, FeedbackReport } from '@/types'
import type { RoundType } from '@/types'
import { CopyReferral } from './CopyReferral'
import InterviewCountdown from './InterviewCountdown'

// Map topic tags to the most relevant round type for "Practice This"
function topicToRoundType(topic: string): RoundType {
  const t = topic.toLowerCase().replace(/_/g, ' ')
  if (t.includes('system') || t.includes('design') || t.includes('architect') || t.includes('scalab')) return 'tech_l2'
  if (t.includes('behav') || t.includes('leader') || t.includes('manag') || t.includes('team') || t.includes('conflict')) return 'managerial'
  if (t.includes('culture') || t.includes('hr') || t.includes('salary') || t.includes('ctc') || t.includes('notice')) return 'hr'
  return 'tech_l1'
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/auth/login')

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  // Fetch more sessions so we can compute progress comparison
  const { data: sessions } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('user_id', authUser.id)
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(20)

  const sessionIds = (sessions ?? []).map((s: InterviewSession) => s.id)

  const { data: reports } = sessionIds.length > 0
    ? await supabase
        .from('feedback_reports')
        .select('session_id, overall_score, selection_probability')
        .in('session_id', sessionIds)
    : { data: [] }

  const { data: weakAreas } = await supabase
    .from('weak_areas')
    .select('topic_tag, avg_score, session_count')
    .eq('user_id', authUser.id)
    .order('avg_score', { ascending: true })
    .limit(3)

  const reportMap = new Map(
    (reports ?? []).map((r: Pick<FeedbackReport, 'session_id' | 'overall_score' | 'selection_probability'>) => [r.session_id, r])
  )

  const user = userData as User | null
  const creditBalance = user?.credit_balance ?? 0
  const currentStreak = user?.current_streak ?? 0
  const longestStreak = user?.longest_streak ?? 0
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://interviewai.in'
  const referralLink = user?.referral_code ? `${appUrl}/?ref=${user.referral_code}` : null

  // Score trend: chronological, last 8 completed sessions with reports (for chart)
  const sessionsWithReports = [...(sessions ?? [])]
    .reverse()
    .filter((s: InterviewSession) => reportMap.has(s.id))

  const chartData = sessionsWithReports
    .slice(-8)
    .map((s: InterviewSession) => ({
      score: (reportMap.get(s.id) as { overall_score: number }).overall_score,
      label: s.ended_at
        ? new Date(s.ended_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : '',
    }))

  // Progress comparison: earliest-3 avg vs latest-3 avg.
  // Requires >= 6 reports so the two windows never overlap.
  const scoreOf = (s: InterviewSession) => (reportMap.get(s.id) as { overall_score: number }).overall_score
  let progressDelta: number | null = null
  if (sessionsWithReports.length >= 6) {
    const first3 = sessionsWithReports.slice(0, 3)
    const last3 = sessionsWithReports.slice(-3)
    const avgFirst = first3.reduce((a, s) => a + scoreOf(s), 0) / 3
    const avgLast = last3.reduce((a, s) => a + scoreOf(s), 0) / 3
    progressDelta = Math.round(avgLast - avgFirst)
  }

  const roundLabels: Record<string, string> = {
    tech_l1: 'Technical L1',
    tech_l2: 'Technical L2',
    managerial: 'Managerial',
    hr: 'HR',
    full_loop: 'Full Loop',
  }

  async function handleSignOut() {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/account"
              className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {creditBalance} credit{creditBalance !== 1 ? 's' : ''}
            </Link>
            <div className="flex items-center gap-2">
              {authUser.user_metadata?.avatar_url && (
                <img
                  src={authUser.user_metadata.avatar_url}
                  alt="avatar"
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm text-gray-700 hidden sm:block">
                {authUser.user_metadata?.full_name ?? authUser.email}
              </span>
            </div>
            <form action={handleSignOut}>
              <button type="submit" className="text-gray-400 hover:text-gray-600">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Welcome + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {authUser.user_metadata?.full_name?.split(' ')[0] ?? 'there'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">Ready for your next practice interview?</p>
          </div>
          {creditBalance > 0 ? (
            <Link
              href="/interview/setup"
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Start New Interview
            </Link>
          ) : (
            <Link
              href="/pricing"
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Buy Credits
            </Link>
          )}
        </div>

        {/* Interview countdown (client — reads localStorage) */}
        <InterviewCountdown />

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{sessions?.length ?? 0}</div>
            <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <Mic className="w-3.5 h-3.5" /> Sessions
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-end gap-1">
              <div className="text-2xl font-bold text-gray-900">
                {reports && reports.length > 0
                  ? Math.round((reports as Array<{overall_score: number}>).reduce((a, r) => a + r.overall_score, 0) / reports.length)
                  : '—'}
              </div>
              {progressDelta !== null && progressDelta !== 0 && (
                <div className={`text-sm font-semibold mb-0.5 ${progressDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {progressDelta > 0 ? `+${progressDelta}` : progressDelta}
                </div>
              )}
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <TrendingUp className="w-3.5 h-3.5" /> Avg score
              {progressDelta !== null && (
                <span className="text-xs text-gray-400">(trend)</span>
              )}
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${currentStreak >= 3 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
            <div className={`text-2xl font-bold flex items-center gap-1 ${currentStreak >= 3 ? 'text-orange-600' : 'text-gray-900'}`}>
              {currentStreak >= 1 && <Flame className="w-5 h-5" />}
              {currentStreak}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              Day streak{longestStreak > currentStreak ? ` · best ${longestStreak}` : ''}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-2xl font-bold text-blue-600">{creditBalance}</div>
            <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
              <CreditCard className="w-3.5 h-3.5" /> Credits left
            </div>
          </div>
        </div>

        {/* Score trend chart */}
        {chartData.length >= 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" /> Score Trend
              </h2>
              {progressDelta !== null && (
                <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                  progressDelta > 0
                    ? 'text-green-700 bg-green-50'
                    : progressDelta < 0
                      ? 'text-red-700 bg-red-50'
                      : 'text-gray-500 bg-gray-50'
                }`}>
                  {progressDelta > 0 ? `↑ +${progressDelta} pts improved` : progressDelta < 0 ? `↓ ${progressDelta} pts` : 'Holding steady'}
                </span>
              )}
            </div>
            <svg
              viewBox="0 0 300 60"
              width="100%"
              height="60"
              preserveAspectRatio="none"
              className="overflow-visible"
            >
              {[25, 50, 75].map((score) => {
                const y = ((100 - score) / 100) * 52 + 4
                return <line key={score} x1="0" y1={y} x2="300" y2={y} stroke="#f3f4f6" strokeWidth="1" />
              })}
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={chartData
                  .map((d, i) => {
                    const x = chartData.length === 1 ? 150 : (i / (chartData.length - 1)) * 300
                    const y = ((100 - d.score) / 100) * 52 + 4
                    return `${x},${y}`
                  })
                  .join(' ')}
              />
              {chartData.map((d, i) => {
                const x = chartData.length === 1 ? 150 : (i / (chartData.length - 1)) * 300
                const y = ((100 - d.score) / 100) * 52 + 4
                return <circle key={i} cx={x} cy={y} r="3" fill="#2563eb" />
              })}
            </svg>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{chartData[0].label}</span>
              <span>{chartData[chartData.length - 1].label}</span>
            </div>
          </div>
        )}

        {/* Weak areas / focus topics — with "Practice This" links */}
        {weakAreas && weakAreas.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold text-gray-900">Focus Areas</h2>
              <span className="text-xs text-gray-400 ml-1">topics to practice more</span>
            </div>
            <div className="px-6 py-4 flex flex-wrap gap-3">
              {(weakAreas as Array<{topic_tag: string; avg_score: number; session_count: number}>).map((wa) => {
                const pct = Math.round((wa.avg_score / 5) * 100)
                const color = pct >= 60 ? 'text-green-600 bg-green-50 border-green-200' : pct >= 40 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200'
                const roundType = topicToRoundType(wa.topic_tag)
                return (
                  <div key={wa.topic_tag} className={`border rounded-xl px-4 py-3 flex items-center gap-4 ${color}`}>
                    <div>
                      <div className="font-medium text-sm capitalize">{wa.topic_tag.replace(/_/g, ' ')}</div>
                      <div className="text-xs opacity-70">{wa.session_count} session{wa.session_count !== 1 ? 's' : ''} · {pct}%</div>
                    </div>
                    <Link
                      href={`/interview/setup?round_type=${roundType}`}
                      className="flex items-center gap-1 text-xs font-semibold bg-white/60 border border-current rounded-lg px-2.5 py-1.5 hover:bg-white transition-colors whitespace-nowrap"
                    >
                      Practice <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Referral programme */}
        {referralLink && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Gift className="w-4 h-4 text-green-500" /> Refer a Friend
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              Share your link. When a friend signs up and completes their first interview, you both get 1 free session.
            </p>
            <CopyReferral link={referralLink} />
          </div>
        )}

        {/* Interview history */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Interview History</h2>
          </div>
          {!sessions || sessions.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Mic className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No interviews yet</p>
              <p className="text-sm text-gray-400 mt-1">Your completed sessions will appear here.</p>
              {creditBalance > 0 && (
                <Link
                  href="/interview/setup"
                  className="inline-flex items-center gap-2 mt-4 text-sm text-blue-600 font-medium hover:underline"
                >
                  Start your first interview →
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {(sessions as InterviewSession[]).slice(0, 10).map((session) => {
                const report = reportMap.get(session.id)
                return (
                  <div key={session.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">
                        {session.company} — {session.role}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {roundLabels[session.round_type] ?? session.round_type}
                        </span>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {session.ended_at
                            ? new Date(session.ended_at).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {report && (
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900">{(report as {overall_score: number}).overall_score}</div>
                          <div className="text-xs text-gray-400">score</div>
                        </div>
                      )}
                      <Link
                        href={`/interview/feedback/${session.id}`}
                        className="text-sm text-blue-600 font-medium hover:underline"
                      >
                        View report →
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

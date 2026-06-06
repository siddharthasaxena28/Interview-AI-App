import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { normalizeTopic } from '@/lib/utils'

export const dynamic = 'force-dynamic'
import { Mic, Plus, Clock, TrendingUp, CreditCard, Flame, Target, Gift, ArrowRight, Zap } from 'lucide-react'
import type { User, InterviewSession, FeedbackReport } from '@/types'
import type { RoundType } from '@/types'
import { CopyReferral } from './CopyReferral'
import InterviewCountdown from './InterviewCountdown'
import EnableReminders from './EnableReminders'
import OnboardingModal from './OnboardingModal'
import UserMenu from './UserMenu'
import StudyPlanWidget from './StudyPlanWidget'
import FingerprintCapture from './FingerprintCapture'
import FadeIn from '@/components/FadeIn'
import { StaggerContainer, StaggerItem } from '@/components/Stagger'

// Exact lookup — mirrors the controlled vocabulary enforced in generate-questions.
const TOPIC_ROUND_MAP: Record<string, RoundType> = {
  // tech_l1
  fundamentals: 'tech_l1', data_structures: 'tech_l1', algorithms: 'tech_l1',
  networking: 'tech_l1', code_quality: 'tech_l1', debugging: 'tech_l1',
  language_concepts: 'tech_l1', problem_solving: 'tech_l1', system_basics: 'tech_l1',
  // tech_l2 — databases appears in both; l2 wins for deeper practice
  system_design: 'tech_l2', architecture: 'tech_l2', scalability: 'tech_l2',
  distributed_systems: 'tech_l2', performance: 'tech_l2', databases: 'tech_l2',
  security: 'tech_l2', trade_offs: 'tech_l2', data_modeling: 'tech_l2', technical_depth: 'tech_l2',
  // managerial
  leadership: 'managerial', team_management: 'managerial', conflict_resolution: 'managerial',
  stakeholder_management: 'managerial', decision_making: 'managerial', project_delivery: 'managerial',
  mentoring: 'managerial', strategy: 'managerial', ownership: 'managerial', cross_functional: 'managerial',
  // hr
  motivation: 'hr', culture_fit: 'hr', career_goals: 'hr', salary_negotiation: 'hr',
  notice_period: 'hr', work_style: 'hr', company_research: 'hr', role_clarity: 'hr',
  strengths_weaknesses: 'hr', behavioral: 'hr',
}

function topicToRoundType(topic: string): RoundType {
  const key = normalizeTopic(topic)
  return TOPIC_ROUND_MAP[key] ?? 'tech_l1'
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
      score: (reportMap.get(s.id) as { overall_score: number | null })?.overall_score ?? 0,
      label: s.ended_at
        ? new Date(s.ended_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : '',
    }))

  // Progress comparison: earliest-3 avg vs latest-3 avg.
  // Requires >= 6 reports so the two windows never overlap.
  const scoreOf = (s: InterviewSession) => (reportMap.get(s.id) as { overall_score: number | null })?.overall_score ?? 0
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

  return (
    <div className="min-h-screen bg-slate-50">
      <FingerprintCapture />
      <OnboardingModal
        show={!sessions?.length}
        userName={authUser.user_metadata?.full_name?.split(' ')[0] ?? 'there'}
        creditBalance={creditBalance}
      />

      {/* Top nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">InterviewAI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                creditBalance > 0
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <CreditCard className="w-3 h-3" />
              {creditBalance} {creditBalance === 1 ? 'credit' : 'credits'}
              {creditBalance === 0 && ' · Top up →'}
            </Link>
            <UserMenu
              name={authUser.user_metadata?.full_name ?? ''}
              email={authUser.email ?? ''}
              avatarUrl={authUser.user_metadata?.avatar_url}
              creditBalance={creditBalance}
              plan={user?.plan ?? 'free'}
            />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Welcome + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-gradient-to-r from-indigo-50 to-transparent border border-indigo-200 rounded-2xl p-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {authUser.user_metadata?.full_name?.split(' ')[0] ?? 'there'}
            </h1>
            <p className="text-gray-600 text-sm mt-1">Ready for your next practice interview?</p>
            <div className="mt-3">
              <EnableReminders />
            </div>
          </div>
          {creditBalance > 0 ? (
            <Link
              href="/interview/setup"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 text-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Start New Interview
            </Link>
          ) : (
            <Link
              href="/pricing"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 text-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Buy Credits
            </Link>
          )}
        </div>

        {/* Interview countdown (client — reads localStorage) */}
        <InterviewCountdown />

        {/* Daily Drill CTA */}
        <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-4 mb-8 flex items-center justify-between gap-4 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">Daily Drill</div>
              <div className="text-xs text-gray-500">3 questions · 5 min · completely free · no credits needed</div>
            </div>
          </div>
          <Link
            href="/drill"
            className="flex-shrink-0 flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-900 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 whitespace-nowrap"
          >
            Start <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Stats row */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StaggerItem lift>
            <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-4 flex items-center gap-3 transition-all duration-200">
              <div className="w-10 h-10 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <Mic className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{sessions?.length ?? 0}</div>
                <div className="text-xs text-gray-500">Sessions</div>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem lift>
            <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-4 flex items-center gap-3 transition-all duration-200">
              <div className="w-10 h-10 bg-violet-50 border border-violet-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <div className="flex items-end gap-1">
                  <div className="text-2xl font-bold text-gray-900">
                    {reports && reports.length > 0
                      ? (() => {
                          const valid = (reports as Array<{overall_score: number | null}>).filter(r => r.overall_score !== null)
                          return valid.length > 0
                            ? Math.round(valid.reduce((a, r) => a + (r.overall_score as number), 0) / valid.length)
                            : '—'
                        })()
                      : '—'}
                  </div>
                  {progressDelta !== null && progressDelta !== 0 && (
                    <div className={`text-sm font-semibold mb-0.5 ${progressDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {progressDelta > 0 ? `+${progressDelta}` : progressDelta}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Avg score{progressDelta !== null ? ' · trend' : ''}
                </div>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem lift>
            <div className={`rounded-2xl border p-4 flex items-center gap-3 transition-all duration-200 ${currentStreak >= 3 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${currentStreak >= 3 ? 'bg-orange-100 border border-orange-200' : 'bg-gray-100 border border-gray-100'}`}>
                <Flame className={`w-5 h-5 ${currentStreak >= 3 ? 'text-orange-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${currentStreak >= 3 ? 'text-orange-600' : 'text-gray-900'}`}>
                  {currentStreak}
                </div>
                <div className="text-xs text-gray-500">
                  Day streak{longestStreak > currentStreak ? ` · best ${longestStreak}` : ''}
                </div>
              </div>
            </div>
          </StaggerItem>
          <StaggerItem lift>
            <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-4 flex items-center gap-3 transition-all duration-200">
              <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">
                  {creditBalance}
                </div>
                <div className="text-xs text-gray-500">Credits left</div>
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>

        {/* Score trend chart */}
        {chartData.length >= 2 && (
          <FadeIn className="mb-8">
          <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-6 transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" /> Score Trend
              </h2>
              {progressDelta !== null && (
                <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                  progressDelta > 0
                    ? 'text-emerald-600 bg-emerald-50 border border-emerald-200'
                    : progressDelta < 0
                      ? 'text-red-600 bg-red-50 border border-red-200'
                      : 'text-gray-600 bg-gray-100 border border-gray-100'
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
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[25, 50, 75].map((score) => {
                const y = ((100 - score) / 100) * 52 + 4
                return (
                  <g key={score}>
                    <line x1="0" y1={y} x2="290" y2={y} stroke="#e5e7eb" strokeWidth="1" />
                    <text x="295" y={y + 3} fontSize="7" fill="#374151" textAnchor="start">{score}</text>
                  </g>
                )
              })}
              <polygon
                fill="url(#chartFill)"
                points={`0,60 ${chartData.map((d, i) => {
                  const x = (i / (chartData.length - 1)) * 300
                  const y = ((100 - d.score) / 100) * 52 + 4
                  return `${x},${y}`
                }).join(' ')} 300,60`}
              />
              <polyline
                fill="none"
                stroke="#6366f1"
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
                return <circle key={i} cx={x} cy={y} r="3" fill="#6366f1" />
              })}
            </svg>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{chartData[0].label}</span>
              <span>{chartData[chartData.length - 1].label}</span>
            </div>
          </div>
          </FadeIn>
        )}

        <StudyPlanWidget />

        {/* Weak areas / focus topics — with "Practice This" links */}
        {weakAreas && weakAreas.length > 0 && (
          <div className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl overflow-hidden mb-8 transition-all duration-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-600" />
              <h2 className="font-semibold text-gray-900">Focus Areas</h2>
              <span className="text-xs text-gray-400 ml-1">topics to practice more</span>
            </div>
            <div className="px-6 py-4 flex flex-wrap gap-3">
              {(weakAreas as Array<{topic_tag: string; avg_score: number; session_count: number}>).map((wa) => {
                const pct = Math.round((wa.avg_score / 5) * 100)
                const color = pct >= 60
                  ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                  : pct >= 40
                    ? 'text-amber-600 bg-amber-50 border-amber-200'
                    : 'text-red-600 bg-red-50 border-red-200'
                const roundType = topicToRoundType(wa.topic_tag)
                return (
                  <div key={wa.topic_tag} className={`border rounded-xl px-4 py-3 flex items-center gap-4 ${color}`}>
                    <div>
                      <div className="font-medium text-sm capitalize">{wa.topic_tag.replace(/_/g, ' ')}</div>
                      <div className="text-xs opacity-60">{wa.session_count} session{wa.session_count !== 1 ? 's' : ''} · {pct}%</div>
                    </div>
                    <Link
                      href={`/interview/setup?round_type=${roundType}`}
                      className="flex items-center gap-1 text-xs font-semibold bg-gray-100 border border-current rounded-lg px-2.5 py-1.5 hover:bg-gray-200 transition-colors whitespace-nowrap"
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
          <div className="bg-white border border-indigo-200 hover:border-indigo-300 rounded-2xl p-6 mb-8 transition-all duration-200">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Gift className="w-4 h-4 text-indigo-600" /> Refer a Friend
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Share your link. When a friend signs up and completes their first interview, you both get 1 free session.
            </p>
            <CopyReferral link={referralLink} />
          </div>
        )}

        {/* Interview history */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Interview History</h2>
          </div>
          {!sessions || sessions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mic className="w-8 h-8 text-indigo-600" />
              </div>
              <p className="text-gray-900 font-semibold text-lg">Start your first mock interview</p>
              <p className="text-sm text-gray-500 mt-1 mb-6 max-w-sm mx-auto">
                Paste a job description, pick a round type, and get a realistic 30-minute voice interview
                with instant AI feedback.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {creditBalance > 0 ? (
                  <Link
                    href="/interview/setup"
                    className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                  >
                    <Plus className="w-4 h-4" /> Start First Interview
                  </Link>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                  >
                    Get started for free →
                  </Link>
                )}
                <Link
                  href="/drill"
                  className="inline-flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-900 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200"
                >
                  Try free daily drill first
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {(sessions as InterviewSession[]).slice(0, 10).map((session) => {
                const report = reportMap.get(session.id)
                return (
                  <div key={session.id} className="px-6 py-4 flex items-center justify-between hover:bg-indigo-50/30 transition-colors">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">
                        {session.company} — {session.role}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {roundLabels[session.round_type] ?? session.round_type}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
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
                          <div className={`text-lg font-bold ${
                            (report as {overall_score: number}).overall_score >= 75 ? 'text-emerald-600' :
                            (report as {overall_score: number}).overall_score >= 55 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {(report as {overall_score: number}).overall_score}
                          </div>
                          <div className="text-xs text-gray-400">score</div>
                        </div>
                      )}
                      <Link
                        href={`/interview/feedback/${session.id}`}
                        className="text-sm text-indigo-600 font-medium hover:text-indigo-700 transition-colors"
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

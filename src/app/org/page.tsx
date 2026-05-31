import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { Mic, Users, TrendingUp, Target, Building2 } from 'lucide-react'
import type { InterviewSession } from '@/types'

export const metadata = { title: 'Cohort Analytics — InterviewAI', robots: { index: false } }

interface MemberStat {
  userId: string
  name: string
  email: string
  sessions: number
  avgScore: number | null
}

export default async function OrgDashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Authorise via RLS-protected membership rows (user can only read their own).
  const { data: adminRows } = await supabase
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .eq('role', 'admin')

  const adminOrgId = adminRows && adminRows.length > 0 ? (adminRows[0] as { org_id: string }).org_id : null

  if (!adminOrgId) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <Building2 className="w-10 h-10 text-blue-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Cohort Analytics for Teams &amp; Colleges</h1>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
            Track interview readiness across your whole batch — average scores, total practice
            sessions, and the topics your cohort struggles with most. Built for placement cells and
            hiring teams.
          </p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            Your account isn&apos;t linked to an organization yet. To set up a cohort dashboard,
            contact us — or run the organizations migration and add yourself as an admin.
          </p>
        </div>
      </Shell>
    )
  }

  // Authorised admin — aggregate cohort data with the service client.
  const service = await createServiceClient()

  const { data: org } = await service
    .from('organizations')
    .select('name, type')
    .eq('id', adminOrgId)
    .single()

  const { data: members } = await service
    .from('organization_members')
    .select('user_id, role')
    .eq('org_id', adminOrgId)

  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)

  const { data: users } = memberIds.length
    ? await service.from('users').select('id, name, email').in('id', memberIds)
    : { data: [] }

  const { data: sessions } = memberIds.length
    ? await service
        .from('interview_sessions')
        .select('id, user_id, status')
        .in('user_id', memberIds)
        .eq('status', 'completed')
    : { data: [] }

  const sessionIds = (sessions ?? []).map((s: Pick<InterviewSession, 'id'>) => s.id)

  const { data: reports } = sessionIds.length
    ? await service.from('feedback_reports').select('session_id, overall_score').in('session_id', sessionIds)
    : { data: [] }

  const { data: weakAreas } = memberIds.length
    ? await service.from('weak_areas').select('topic_tag, avg_score, session_count').in('user_id', memberIds)
    : { data: [] }

  // Build per-member stats
  const scoreBySession = new Map(
    (reports ?? []).map((r: { session_id: string; overall_score: number }) => [r.session_id, r.overall_score])
  )
  const userById = new Map(
    (users ?? []).map((u: { id: string; name: string; email: string }) => [u.id, u])
  )
  const sessionsByUser = new Map<string, { id: string }[]>()
  for (const s of (sessions ?? []) as Array<{ id: string; user_id: string }>) {
    const arr = sessionsByUser.get(s.user_id) ?? []
    arr.push({ id: s.id })
    sessionsByUser.set(s.user_id, arr)
  }

  const memberStats: MemberStat[] = memberIds.map((uid) => {
    const u = userById.get(uid) as { name?: string; email?: string } | undefined
    const userSessions = sessionsByUser.get(uid) ?? []
    const scores = userSessions
      .map((s) => scoreBySession.get(s.id))
      .filter((v): v is number => typeof v === 'number')
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
    return {
      userId: uid,
      name: u?.name ?? 'Member',
      email: u?.email ?? '',
      sessions: userSessions.length,
      avgScore: avg,
    }
  }).sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1))

  const totalSessions = (sessions ?? []).length
  const allScores = Array.from(scoreBySession.values())
  const cohortAvg = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null

  // Aggregate weak topics across the cohort (weighted by session_count)
  const topicAgg = new Map<string, { weighted: number; count: number }>()
  for (const wa of (weakAreas ?? []) as Array<{ topic_tag: string; avg_score: number; session_count: number }>) {
    const cur = topicAgg.get(wa.topic_tag) ?? { weighted: 0, count: 0 }
    cur.weighted += wa.avg_score * wa.session_count
    cur.count += wa.session_count
    topicAgg.set(wa.topic_tag, cur)
  }
  const topWeak = Array.from(topicAgg.entries())
    .map(([topic, v]) => ({ topic, pct: Math.round((v.weighted / v.count / 5) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5)

  const orgInfo = org as { name: string; type: string } | null

  return (
    <Shell>
      <div className="mb-6">
        <div className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">
          {orgInfo?.type === 'college' ? 'College cohort' : 'Team'} analytics
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{orgInfo?.name ?? 'Your organization'}</h1>
      </div>

      {/* Cohort stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat icon={<Users className="w-3.5 h-3.5" />} label="Members" value={memberIds.length} />
        <Stat icon={<Mic className="w-3.5 h-3.5" />} label="Sessions completed" value={totalSessions} />
        <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Cohort avg score" value={cohortAvg ?? '—'} />
        <Stat
          icon={<Target className="w-3.5 h-3.5" />}
          label="Practising members"
          value={memberStats.filter((m) => m.sessions > 0).length}
        />
      </div>

      {/* Top weak areas across cohort */}
      {topWeak.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-500" /> Where the cohort struggles most
          </h2>
          <div className="flex flex-wrap gap-3">
            {topWeak.map((t) => {
              const color = t.pct >= 60 ? 'text-green-600 bg-green-50 border-green-200' : t.pct >= 40 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200'
              return (
                <div key={t.topic} className={`border rounded-lg px-4 py-2.5 ${color}`}>
                  <div className="font-medium text-sm capitalize">{t.topic.replace(/_/g, ' ')}</div>
                  <div className="text-lg font-bold">{t.pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per-member table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Members</h2>
        </div>
        {memberStats.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">No members yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {memberStats.map((m) => (
              <div key={m.userId} className="px-6 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">{m.name}</div>
                  <div className="text-xs text-gray-400 truncate">{m.email}</div>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{m.sessions}</div>
                    <div className="text-xs text-gray-400">sessions</div>
                  </div>
                  <div className="text-right w-12">
                    <div className="text-sm font-semibold text-gray-900">{m.avgScore ?? '—'}</div>
                    <div className="text-xs text-gray-400">avg</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">{icon} {label}</div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</Link>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}

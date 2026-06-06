import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { getScoreColor, getProbabilityLabel } from '@/lib/utils'
import { CheckCircle, AlertCircle, Mic } from 'lucide-react'
import type { FeedbackReport, StrengthItem, GapItem } from '@/types'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('feedback_reports')
    .select('overall_score, selection_probability, interview_sessions(company, role)')
    .eq('share_token', token)
    .single()

  if (!data) return { title: 'Interview Report — InterviewAI' }

  const session = data.interview_sessions as unknown as { company: string; role: string } | null
  const company = session?.company ?? 'Company'
  const role = session?.role ?? 'Role'
  const score = data.overall_score as number
  const prob = data.selection_probability as number
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const title = `${company} ${role} Interview — ${score}/100 on InterviewAI`
  const description = `Scored ${score}/100 with a ${prob}% chance of selection for the ${role} role at ${company}. Powered by InterviewAI — practise like it's real.`
  const ogImageUrl = `${appUrl}/report/${token}/opengraph-image`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl}/report/${token}`,
      siteName: 'InterviewAI',
      type: 'article',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${company} ${role} interview scorecard` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createServiceClient()

  const { data: report } = await supabase
    .from('feedback_reports')
    .select('*, interview_sessions(company, role, round_type)')
    .eq('share_token', token)
    .single()

  if (!report) notFound()

  const r = report as FeedbackReport & {
    interview_sessions: { company: string; role: string; round_type: string }
  }
  const strengths = (r.strengths_json as StrengthItem[]) ?? []
  const gaps = (r.gaps_json as GapItem[]) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Mic className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-gray-900">InterviewAI</span>
          <span className="text-gray-400 ml-2 text-sm">Interview Report</span>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="text-sm text-gray-500 mb-1">
            {r.interview_sessions?.company} — {r.interview_sessions?.role}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Interview Feedback Report</h1>
        </div>

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

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Overall Assessment</h2>
          <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{r.report_text}</p>
        </div>

        {strengths.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" /> Strengths
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {strengths.map((s, i) => (
                <div key={i} className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="font-semibold text-green-800 text-sm mb-1">{s.title}</div>
                  <p className="text-green-700 text-xs">{s.advice}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {gaps.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" /> Areas to Improve
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {gaps.map((g, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="font-semibold text-amber-800 text-sm mb-1">{g.title}</div>
                  <p className="text-amber-700 text-xs">{g.advice}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
          <p className="text-blue-800 font-medium mb-2">Want to practice your own interviews?</p>
          <a
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700"
          >
            Try InterviewAI Free
          </a>
        </div>
      </main>
    </div>
  )
}

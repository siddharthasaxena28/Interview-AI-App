import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Mic, ArrowRight, CheckCircle, Target, MessageSquare, TrendingUp } from 'lucide-react'
import { PRACTICE_GUIDES, getGuide } from '@/lib/practice-content'

export function generateStaticParams() {
  return PRACTICE_GUIDES.map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) return { title: 'Practice — InterviewAI' }

  const title = `${guide.company} ${guide.role} Interview Questions & Mock Practice — InterviewAI`
  return {
    title,
    description: guide.metaDescription,
    keywords: `${guide.company} interview, ${guide.role} interview questions, ${guide.company} mock interview, ${guide.role} interview preparation, India`,
    alternates: { canonical: `/practice/${guide.slug}` },
    openGraph: {
      title,
      description: guide.metaDescription,
      type: 'article',
    },
  }
}

export default async function PracticeGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) notFound()

  // JSON-LD structured data for rich search results
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.sampleQuestions.map((sq) => ({
      '@type': 'Question',
      name: sq.q,
      acceptedAnswer: { '@type': 'Answer', text: sq.tip },
    })),
  }

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">InterviewAI</span>
          </Link>
          <Link
            href="/auth/login"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Free
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <div className="text-sm text-gray-400 mb-4">
          <Link href="/practice" className="hover:text-gray-600">Practice</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-600">{guide.company} {guide.role}</span>
        </div>

        {/* Hero */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
          {guide.company} {guide.role} Interview Questions
        </h1>
        <p className="text-lg text-gray-600 mb-6 leading-relaxed">{guide.intro}</p>

        <div className="flex flex-wrap gap-3 mb-8">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Practise a free {guide.company} mock interview
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Quick facts */}
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Target className="w-4 h-4 text-amber-500" /> Round
            </div>
            <div className="font-semibold text-gray-900">{guide.roundLabel}</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Difficulty
            </div>
            <div className="font-semibold text-gray-900">{guide.difficulty}</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <MessageSquare className="w-4 h-4 text-green-500" /> Avg practice score
            </div>
            <div className="font-semibold text-gray-900">{guide.avgScore}/100</div>
          </div>
        </div>

        {/* Skills */}
        <h2 className="text-xl font-bold text-gray-900 mb-3">What they assess</h2>
        <div className="flex flex-wrap gap-2 mb-10">
          {guide.skills.map((s) => (
            <span key={s} className="bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-full font-medium">
              {s}
            </span>
          ))}
        </div>

        {/* Sample questions */}
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Sample {guide.company} {guide.role} interview questions
        </h2>
        <div className="space-y-4 mb-10">
          {guide.sampleQuestions.map((sq, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-2">{sq.q}</p>
                  <p className="text-sm text-gray-600 flex items-start gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><strong className="text-gray-700">How to answer:</strong> {sq.tip}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-blue-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-2">
            Ready for the real {guide.company} interview?
          </h2>
          <p className="text-blue-100 mb-6 max-w-xl mx-auto">
            Practise a full voice mock interview with an AI interviewer, answer out loud, and get a
            detailed feedback report with your selection probability — free to start.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-50 transition-colors"
          >
            Start your free mock interview
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        {/* Related */}
        <div className="mt-12">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Other interview guides</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {PRACTICE_GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 4).map((g) => (
              <Link
                key={g.slug}
                href={`/practice/${g.slug}`}
                className="border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40 transition-colors flex items-center justify-between group"
              >
                <span className="text-sm font-medium text-gray-900">{g.company} {g.role}</span>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500" />
              </Link>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8 mt-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span>© 2026 InterviewAI. Made in India.</span>
          <div className="flex gap-6">
            <Link href="/practice" className="hover:text-gray-900">All guides</Link>
            <Link href="/pricing" className="hover:text-gray-900">Pricing</Link>
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

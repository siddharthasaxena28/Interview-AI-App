import Link from 'next/link'
import type { Metadata } from 'next'
import { Mic, ArrowRight } from 'lucide-react'
import { PRACTICE_GUIDES } from '@/lib/practice-content'

export const metadata: Metadata = {
  title: 'Mock Interview Practice Guides by Company & Role — InterviewAI',
  description:
    'Free company-specific mock interview practice. Sample questions and tips for Google, Amazon, Flipkart, TCS, Infosys and more — then practise live with AI.',
  alternates: { canonical: '/practice' },
}

export default function PracticeIndexPage() {
  return (
    <div className="min-h-screen bg-white">
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
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
          Company interview practice guides
        </h1>
        <p className="text-lg text-gray-600 mb-10 max-w-2xl">
          Real sample questions and how-to-answer tips for the companies people actually interview
          at — then practise a full voice mock interview with AI feedback.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {PRACTICE_GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/practice/${g.slug}`}
              className="border border-gray-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="text-xs text-blue-600 font-medium mb-1">{g.roundLabel}</div>
              <div className="font-semibold text-gray-900 text-lg mb-1">
                {g.company} — {g.role}
              </div>
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{g.metaDescription}</p>
              <span className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium">
                View questions <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-gray-100 px-6 py-8 mt-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
          <span>© 2026 InterviewAI. Made in India.</span>
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-gray-900">Pricing</Link>
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

import Link from 'next/link'
import { Mic, Brain, BarChart3, CheckCircle, Star, ArrowRight, Zap, Users, Award, Clock } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Session count is read live from the DB on every request, so the page must
// not be statically cached at build time.
export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  const { count: sessionCount } = await supabase
    .from('interview_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
  const completedCount = sessionCount ?? 0
  const displayCount = completedCount >= 1000
    ? `${Math.floor(completedCount / 1000)}k+`
    : completedCount > 0 ? `${completedCount}+` : '1,000+'

  const dashboardHref = '/dashboard'
  const signupHref = '/auth/login'
  const pricingHref = isLoggedIn ? '/pricing' : '/auth/login'

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">InterviewAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</Link>
            {isLoggedIn ? (
              <Link
                href={dashboardHref}
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </Link>
            ) : (
              <Link
                href={signupHref}
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Get Started Free
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Returning-user banner — only shown when logged in */}
      {isLoggedIn && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-3 text-center text-sm text-blue-700">
          Welcome back!{' '}
          <Link href={dashboardHref} className="font-semibold underline underline-offset-2 hover:text-blue-900">
            Go to your dashboard →
          </Link>
        </div>
      )}

      {/* Hero */}
      <section className="px-6 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full mb-6">
            <Zap className="w-3 h-3" />
            <span>India&apos;s first AI voice mock interview platform</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Practice like it&apos;s real.<br />
            <span className="text-blue-600">Perform when it matters.</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Simulate a real telephonic interview with AI. Get JD-specific questions,
            real-time adaptive difficulty, and a detailed feedback report — available 24/7.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {isLoggedIn ? (
              <Link
                href={dashboardHref}
                className="bg-blue-600 text-white text-lg px-8 py-4 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 font-semibold"
              >
                Go to Dashboard <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <>
                <Link
                  href={signupHref}
                  className="bg-blue-600 text-white text-lg px-8 py-4 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 font-semibold"
                >
                  Start Free Interview <ArrowRight className="w-5 h-5" />
                </Link>
                <p className="text-sm text-gray-500">No credit card • 1 free session included</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="px-6 py-8 bg-gray-50 border-y border-gray-100">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 text-center">
          {[
            { icon: Mic, value: displayCount, label: 'Mock interviews completed' },
            { icon: Zap, value: 'No subscription', label: 'Pay as you go, credits never expire' },
            { icon: Clock, value: '24 / 7', label: 'Practice any time, no scheduling' },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-blue-600" />
              <div className="text-left">
                <div className="font-bold text-gray-900">{value}</div>
                <div className="text-sm text-gray-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Everything you need to crack your interview
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Not a quiz. Not a chatbot. A real telephonic interview simulation with AI.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Brain,
                title: 'JD-Personalised Questions',
                desc: 'Paste your job description and company name. Our AI researches what that company actually asks and generates 15 targeted questions — not generic ones.',
                color: 'bg-blue-50 text-blue-600',
              },
              {
                icon: Mic,
                title: '4 Distinct Round Types',
                desc: 'Practice Technical L1, Technical L2, Managerial, or HR rounds. Each has a different AI interviewer persona with a distinct style and voice.',
                color: 'bg-purple-50 text-purple-600',
              },
              {
                icon: BarChart3,
                title: 'Instant Detailed Feedback',
                desc: 'Get a 7-section feedback report with overall score, selection probability %, top strengths, improvement gaps, and per-question breakdown.',
                color: 'bg-green-50 text-green-600',
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="border border-gray-200 rounded-2xl p-6 hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-lg">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Paste your JD', desc: 'Share the job description and company name' },
              { step: '2', title: 'Pick a round', desc: 'Choose Technical, Managerial, or HR' },
              { step: '3', title: 'Speak your answers', desc: 'AI asks questions via voice, just like a real call' },
              { step: '4', title: 'Get your report', desc: 'Detailed feedback with selection probability' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mx-auto mb-3">
                  {step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-3">
            Buy sessions when you need them
          </h2>
          <p className="text-center text-gray-600 mb-10">
            No subscription. No monthly bills. Credits never expire.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: 'Single', price: '₹249', per: '₹249/session', sessions: '1 session', saving: null, highlighted: false },
              { name: 'Starter Pack', price: '₹999', per: '₹200/session', sessions: '5 sessions', saving: 'Save 20%', highlighted: true },
              { name: 'Serious Prep', price: '₹1,799', per: '₹180/session', sessions: '10 sessions', saving: 'Save 28%', highlighted: false },
            ].map(({ name, price, per, sessions, saving, highlighted }) => (
              <div
                key={name}
                className={`rounded-2xl p-6 border text-center ${
                  highlighted
                    ? 'border-blue-500 bg-blue-600 text-white shadow-lg scale-105'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {saving && (
                  <div className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit mx-auto mb-3 ${
                    highlighted ? 'bg-white text-blue-600' : 'bg-green-100 text-green-700'
                  }`}>
                    {saving}
                  </div>
                )}
                <div className="font-bold text-lg mb-1">{name}</div>
                <div className="text-3xl font-bold mb-1">{price}</div>
                <div className={`text-sm mb-1 ${highlighted ? 'text-blue-200' : 'text-gray-500'}`}>{per}</div>
                <div className={`text-sm font-medium mb-5 ${highlighted ? 'text-blue-100' : 'text-gray-600'}`}>{sessions}</div>
                <Link
                  href={pricingHref}
                  className={`block py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    highlighted
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Buy now →
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-6">
            New? Every account includes 1 free session — no payment needed.{' '}
            <Link href={isLoggedIn ? '/dashboard' : '/auth/login'} className="text-blue-600 hover:underline">Get started →</Link>
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-20 bg-blue-600 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            Your interview is in 9 hours. Are you ready?
          </h2>
          <p className="text-blue-100 mb-8">One free session. No credit card. Just practice.</p>
          <Link
            href={isLoggedIn ? dashboardHref : signupHref}
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors text-lg"
          >
            {isLoggedIn ? 'Go to Dashboard' : 'Start your free interview'}
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <Mic className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-gray-900">InterviewAI</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-900">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-gray-900">Pricing</Link>
          </div>
          <p className="text-sm text-gray-400">© 2026 InterviewAI. Made in India.</p>
        </div>
      </footer>
    </div>
  )
}

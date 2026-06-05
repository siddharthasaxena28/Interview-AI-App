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
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            <span className="font-bold text-xl text-gray-900">InterviewAI</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link
                href={dashboardHref}
                className="bg-indigo-600 text-white text-sm px-5 py-2 rounded-full hover:bg-indigo-500 transition-colors font-medium"
              >
                Go to Dashboard
              </Link>
            ) : (
              <Link
                href={signupHref}
                className="bg-indigo-600 text-white text-sm px-5 py-2 rounded-full hover:bg-indigo-500 transition-colors font-medium"
              >
                Get Started Free
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Returning-user banner — only shown when logged in */}
      {isLoggedIn && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-2 text-center text-sm text-indigo-700">
          Welcome back!{' '}
          <Link href={dashboardHref} className="font-semibold underline underline-offset-2 hover:text-indigo-900">
            Go to your dashboard →
          </Link>
        </div>
      )}

      {/* Hero */}
      <section className="relative px-6 pt-28 pb-24 text-center overflow-hidden min-h-[85vh] flex items-center">
        {/* Subtle radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.08),transparent)] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10 w-full">
          <div className="inline-flex items-center gap-2 border border-indigo-200 bg-indigo-50 text-indigo-600 text-sm px-4 py-1.5 rounded-full mb-8">
            <Zap className="w-3 h-3" />
            <span>India&apos;s first AI voice mock interview platform</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight tracking-tight">
            Practice like it&apos;s real.<br />
            <span className="text-indigo-600">Perform when it matters.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-500 mb-10 max-w-xl mx-auto leading-relaxed">
            Simulate a real telephonic interview with AI. Get JD-specific questions,
            real-time adaptive difficulty, and a detailed feedback report — available 24/7.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            {isLoggedIn ? (
              <Link
                href={dashboardHref}
                className="bg-indigo-600 text-white text-lg px-8 py-4 rounded-xl hover:bg-indigo-500 transition-colors flex items-center gap-2 font-semibold shadow-[0_4px_24px_rgba(99,102,241,0.25)]"
              >
                Go to Dashboard <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <>
                <Link
                  href={signupHref}
                  className="bg-indigo-600 text-white text-lg px-8 py-4 rounded-xl hover:bg-indigo-500 transition-colors flex items-center gap-2 font-semibold shadow-[0_4px_24px_rgba(99,102,241,0.25)]"
                >
                  Start Free Interview <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href={signupHref}
                  className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-lg px-8 py-4 rounded-xl transition-colors font-medium"
                >
                  No credit card · 1 free session
                </Link>
              </>
            )}
          </div>
          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { icon: Mic, value: displayCount, label: 'Mock interviews completed' },
              { icon: Zap, value: 'No subscription', label: 'Pay as you go, credits never expire' },
              { icon: Clock, value: '24 / 7', label: 'Practice any time, no scheduling' },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="bg-white border border-gray-200 shadow-sm rounded-xl px-6 py-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-gray-900 text-sm">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Everything you need to crack your interview
          </h2>
          <p className="text-center text-gray-500 mb-14 max-w-2xl mx-auto">
            Not a quiz. Not a chatbot. A real telephonic interview simulation with AI.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: 'JD-Personalised Questions',
                desc: 'Paste your job description and company name. Our AI researches what that company actually asks and generates 15 targeted questions — not generic ones.',
              },
              {
                icon: Mic,
                title: '4 Distinct Round Types',
                desc: 'Practice Technical L1, Technical L2, Managerial, or HR rounds. Each has a different AI interviewer persona with a distinct style and voice.',
              },
              {
                icon: BarChart3,
                title: 'Instant Detailed Feedback',
                desc: 'Get a 7-section feedback report with overall score, selection probability %, top strengths, improvement gaps, and per-question breakdown.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 hover:border-indigo-300 transition-all duration-300">
                <div className="bg-indigo-50 rounded-xl p-3 w-fit mb-4">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-lg">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-14">
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
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold mx-auto mb-3 shadow-[0_4px_12px_rgba(99,102,241,0.3)]">
                  {step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-3">
            Buy sessions when you need them
          </h2>
          <p className="text-center text-gray-500 mb-12">
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
                className={`rounded-2xl p-8 border text-center transition-all duration-300 ${
                  highlighted
                    ? 'bg-indigo-50 border-indigo-300 shadow-md scale-[1.03]'
                    : 'bg-white border-gray-200 shadow-sm hover:border-indigo-200'
                }`}
              >
                {saving && (
                  <div className={`text-xs font-bold px-3 py-1 rounded-full w-fit mx-auto mb-4 ${
                    highlighted ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-gray-100 text-gray-600 border border-gray-200'
                  }`}>
                    {saving}
                  </div>
                )}
                <div className="font-bold text-lg mb-1 text-gray-900">{name}</div>
                <div className="text-4xl font-bold mb-1 text-gray-900">{price}</div>
                <div className={`text-sm mb-1 ${highlighted ? 'text-indigo-600' : 'text-gray-500'}`}>{per}</div>
                <div className={`text-sm font-medium mb-6 ${highlighted ? 'text-indigo-700' : 'text-gray-600'}`}>{sessions}</div>
                <Link
                  href={pricingHref}
                  className={`block py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    highlighted
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  Buy now →
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            New? Every account includes 1 free session — no payment needed.{' '}
            <Link href={isLoggedIn ? '/dashboard' : '/auth/login'} className="text-indigo-600 hover:text-indigo-700 transition-colors">Get started →</Link>
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-24 relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,rgba(99,102,241,0.06),transparent)] pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Your interview is in 9 hours. Are you ready?
          </h2>
          <p className="text-gray-500 mb-10">One free session. No credit card. Just practice.</p>
          <Link
            href={isLoggedIn ? dashboardHref : signupHref}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-lg shadow-[0_4px_24px_rgba(99,102,241,0.3)]"
          >
            {isLoggedIn ? 'Go to Dashboard' : 'Start your free interview'}
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 border-t border-gray-200 px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-700 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-700 transition-colors">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-gray-700 transition-colors">Pricing</Link>
          </div>
          <p className="text-sm text-gray-400">© 2026 InterviewAI. Made in India.</p>
        </div>
      </footer>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Mic, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deleted = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('message') === 'account_deleted'

  async function signInWithGoogle() {
    setLoading(true)
    setError(null)
    try {
      const refCode = new URLSearchParams(window.location.search).get('ref')
      if (refCode) {
        document.cookie = `referral_code=${encodeURIComponent(refCode)}; path=/; max-age=604800; SameSite=Lax`
      }
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) { setError(error.message); setLoading(false) }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden">
      {/* Left — brand panel, desktop only */}
      <div className="hidden lg:flex lg:w-[52%] bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 flex-col justify-between p-12 relative overflow-hidden">
        {/* subtle dot grid */}
        <div className="absolute inset-0 opacity-[0.06]" style={{backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)',backgroundSize:'28px 28px'}} />
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-xl tracking-tight">InterviewAI</span>
        </div>
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white mb-3 leading-tight">
            Practice like it&apos;s real.<br />
            <span className="text-blue-400">Perform when it matters.</span>
          </h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            India&apos;s first AI voice mock interview platform — real telephonic simulation with instant feedback.
          </p>
          <div className="space-y-3.5">
            {[
              'JD-personalised questions tailored to your exact role',
              'Live voice interview with adaptive AI probing',
              'Detailed scorecard with selection probability',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3 h-3 text-blue-400" />
                </div>
                <span className="text-slate-300 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10">
          <p className="text-slate-600 text-xs">© 2026 InterviewAI · Made in India</p>
        </div>
      </div>

      {/* Right — sign-in panel */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-10">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">InterviewAI</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Sign in to continue</h1>
          <p className="text-gray-500 text-sm mb-8">1 free interview session included on signup.</p>

          {deleted && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl px-4 py-3 mb-6 text-left">
              Your account and personal data have been permanently deleted. You can sign in again — your previous data will not be restored.
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {error && <p className="text-xs text-red-500 mt-4 text-center">{error}</p>}

          <p className="text-xs text-gray-400 mt-8 text-center leading-relaxed">
            By signing in, you agree to our{' '}
            <a href="/terms" className="underline underline-offset-2 hover:text-gray-600">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" className="underline underline-offset-2 hover:text-gray-600">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

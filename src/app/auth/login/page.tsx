'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
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
      // Persist referral code from URL query param across OAuth redirect
      const refCode = new URLSearchParams(window.location.search).get('ref')
      if (refCode) {
        document.cookie = `referral_code=${encodeURIComponent(refCode)}; path=/; max-age=604800; SameSite=Lax`
      }

      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden bg-slate-50">
      {/* Left — brand panel, desktop only */}
      <div className="hidden lg:flex lg:w-[52%] bg-slate-50 flex-col justify-between p-12 relative overflow-hidden">
        {/* Indigo radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_20%_50%,rgba(99,102,241,0.12),transparent)] pointer-events-none" />
        {/* Decorative gradient orb */}
        <div className="absolute bottom-[-80px] right-[-80px] w-[360px] h-[360px] rounded-full bg-indigo-50 blur-[80px] pointer-events-none" />
        <div className="absolute top-[-60px] left-[10%] w-[240px] h-[240px] rounded-full bg-indigo-50 blur-[60px] pointer-events-none" />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          <span className="font-bold text-gray-900 text-xl tracking-tight">InterviewAI</span>
        </div>

        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-gray-900 mb-3 leading-tight">
            Practice like it&apos;s real.<br />
            <span className="text-indigo-600">Perform when it matters.</span>
          </h2>
          <p className="text-gray-500 text-sm mb-10 leading-relaxed">
            India&apos;s first AI voice mock interview platform — real telephonic simulation with instant feedback.
          </p>
          <div className="space-y-4">
            {[
              'JD-personalised questions tailored to your exact role',
              'Live voice interview with adaptive AI probing',
              'Detailed scorecard with selection probability',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3 h-3 text-indigo-600" />
                </div>
                <span className="text-gray-600 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-gray-400 text-xs">© 2026 InterviewAI · Made in India</p>
        </div>
      </div>

      {/* Right — sign-in panel */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo — shown only on mobile */}
          <div className="flex lg:hidden items-center gap-2 mb-10">
            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
            <span className="font-bold text-gray-900 text-lg">InterviewAI</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Sign in to InterviewAI</h1>
            <p className="text-gray-600 text-sm mb-8">1 free interview session included on signup.</p>
          </motion.div>

          {deleted && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl px-4 py-3 mb-6 text-left">
              Your account and personal data have been permanently deleted. You can sign in again — your previous data will not be restored.
            </div>
          )}

          <motion.button
            onClick={signInWithGoogle}
            disabled={loading}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-900 rounded-xl px-6 py-3 w-full flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            <span className="text-sm font-medium">{loading ? 'Redirecting...' : 'Continue with Google'}</span>
          </motion.button>

          {error && (
            <p className="text-xs text-red-600 mt-4 text-center">{error}</p>
          )}

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}
          >
            <div className="mt-6 flex justify-center">
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full px-4 py-2 text-sm">
                1 free session included — no card needed
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-8 text-center leading-relaxed">
              By signing in, you agree to our{' '}
              <a href="/terms" className="underline underline-offset-2 hover:text-gray-600 transition-colors">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" className="underline underline-offset-2 hover:text-gray-600 transition-colors">Privacy Policy</a>.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

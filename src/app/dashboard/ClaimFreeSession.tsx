'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Gift, Mail, ShieldCheck, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'

type Step = 'intro' | 'sending' | 'otp' | 'granted' | 'denied'

export default function ClaimFreeSession() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intro')
  const [otp, setOtp] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deniedMsg, setDeniedMsg] = useState('')
  const fingerprintRef = useRef<string>('')

  useEffect(() => {
    let cancelled = false
    import('@fingerprintjs/fingerprintjs')
      .then(FP => FP.load())
      .then(fp => fp.get())
      .then(res => { if (!cancelled) fingerprintRef.current = res.visitorId })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function requestOtp() {
    setError(null)
    setStep('sending')
    try {
      const res = await fetch('/api/phone/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not send the code. Try again.')
        setStep('intro')
        return
      }
      setOtpToken(data.token ?? '')
      setMaskedEmail(data.maskedEmail ?? 'your email')
      setStep('otp')
    } catch {
      setError('Network error. Please try again.')
      setStep('intro')
    }
  }

  async function submitOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/phone/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, token: otpToken, fingerprint: fingerprintRef.current }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Verification failed. Try again.')
        return
      }
      if (data.granted) {
        setStep('granted')
        router.refresh()
      } else {
        setDeniedMsg(
          data.reason === 'phone_already_used'
            ? 'This email has already claimed a free session on another account.'
            : data.reason === 'device_limit'
              ? 'This device has already been used for several free sessions.'
              : 'The free credit has already been claimed on this account.'
        )
        setStep('denied')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'granted') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-8 flex items-center gap-3">
        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-semibold text-green-900 text-sm">Free session unlocked!</div>
          <div className="text-xs text-green-700 mt-0.5">1 credit added to your account. You&apos;re ready to start.</div>
        </div>
        <Link
          href="/interview/setup"
          className="flex-shrink-0 flex items-center gap-1.5 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          Start <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
  }

  if (step === 'denied') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900 text-sm">Email verified</div>
            <div className="text-xs text-amber-700 mt-1">{deniedMsg}</div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 mt-3 bg-blue-600 text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Buy sessions <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-8">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Gift className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-blue-900 text-sm">Claim your free interview session</div>
          <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verify your email to unlock 1 free session — no payment needed.
          </div>

          {step === 'intro' && (
            <div className="mt-3 space-y-1">
              <button
                onClick={requestOtp}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" /> Send verification code
              </button>
              <p className="text-xs text-blue-400">We&apos;ll email the code to your Google account email.</p>
            </div>
          )}

          {step === 'sending' && (
            <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
              <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              Sending code…
            </div>
          )}

          {step === 'otp' && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">
                We sent a 6-digit code to <span className="font-medium">{maskedEmail}</span>. Check your inbox (and spam).
              </p>
              <div className="flex items-stretch gap-2 max-w-xs">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter' && otp.length >= 6 && !loading) submitOtp() }}
                  placeholder="6-digit code"
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={submitOtp}
                  disabled={loading || otp.length < 6}
                  className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Checking…' : 'Verify'}
                </button>
              </div>
              <button
                onClick={requestOtp}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Resend code
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}

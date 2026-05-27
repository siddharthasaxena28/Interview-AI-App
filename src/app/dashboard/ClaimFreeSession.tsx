'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Gift, Phone, ShieldCheck, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'

type Step = 'intro' | 'phone' | 'otp' | 'granted' | 'denied'

export default function ClaimFreeSession() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intro')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deniedMsg, setDeniedMsg] = useState('')
  const fingerprintRef = useRef<string>('')

  // Compute the device fingerprint in the background (OSS FingerprintJS, keyless,
  // fully client-side). It's a soft anti-abuse signal — failure must not block the
  // flow, so we just leave it blank.
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
    setLoading(true)
    try {
      const res = await fetch('/api/phone/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not send the code. Try again.')
        return
      }
      setOtpToken(data.token ?? '')
      setStep('otp')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/phone/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, token: otpToken, fingerprint: fingerprintRef.current }),
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
            ? 'This number has already claimed a free session on another account. Your phone is verified, but the free credit can only be used once per number.'
            : data.reason === 'device_limit'
              ? 'This device has already been used for several free sessions. Your phone is verified, but no additional free credit can be granted.'
              : 'Your phone is verified, but the free credit has already been claimed.'
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
            <div className="font-semibold text-amber-900 text-sm">Phone verified</div>
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
          <Gift className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-blue-900 text-sm">Claim your free interview session</div>
          <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verify your mobile number to unlock 1 free session — no payment needed.
          </div>

          {step === 'intro' && (
            <button
              onClick={() => setStep('phone')}
              className="mt-3 flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> Verify my number
            </button>
          )}

          {step === 'phone' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-stretch gap-2 max-w-sm">
                <span className="flex items-center px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-500">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={e => { if (e.key === 'Enter' && phone.length === 10 && !loading) requestOtp() }}
                  placeholder="10-digit mobile number"
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={requestOtp}
                disabled={loading || phone.length !== 10}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending…' : 'Send code'}
              </button>
            </div>
          )}

          {step === 'otp' && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">Enter the code we sent to +91 {phone}</p>
              <div className="flex items-stretch gap-2 max-w-xs">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter' && otp.length >= 4 && !loading) submitOtp() }}
                  placeholder="6-digit code"
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={submitOtp}
                  disabled={loading || otp.length < 4}
                  className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Checking…' : 'Verify'}
                </button>
              </div>
              <button
                onClick={() => { setOtp(''); setOtpToken(''); setError(null); setStep('phone') }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Change number
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { CheckCircle, Mic, ArrowRight, Zap, Clock, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useAnalytics } from '@/hooks/useAnalytics'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void }
  }
}

const PACKS = [
  {
    key: 'single',
    name: 'Single Session',
    price: '₹249',
    priceNote: '₹249 per session',
    sessions: 1,
    total: 249,
    saving: null,
    features: [
      'All 4 round types',
      'JD-personalised questions',
      'Full feedback report',
      'Selection probability score',
      'Shareable report link',
    ],
    cta: 'Buy 1 Session',
    highlighted: false,
    badge: null,
  },
  {
    key: 'starter',
    name: 'Starter Pack',
    price: '₹999',
    priceNote: '₹200 per session',
    sessions: 5,
    total: 999,
    saving: '₹246 saved vs single',
    features: [
      'All 4 round types',
      'JD-personalised questions',
      'Full feedback report',
      'Selection probability score',
      'Shareable report link',
    ],
    cta: 'Buy 5 Sessions',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    key: 'serious',
    name: 'Serious Prep',
    price: '₹1,799',
    priceNote: '₹180 per session',
    sessions: 10,
    total: 1799,
    saving: '₹691 saved vs single',
    features: [
      'All 4 round types',
      'JD-personalised questions',
      'Full feedback report',
      'Selection probability score',
      'Shareable report link',
    ],
    cta: 'Buy 10 Sessions',
    highlighted: false,
    badge: 'Best Value',
  },
] as const

type PackKey = 'single' | 'starter' | 'serious'

export default function PricingPage() {
  const [loadingPack, setLoadingPack] = useState<PackKey | null>(null)
  const analytics = useAnalytics()

  async function handlePurchase(pack: PackKey, amount: number) {
    setLoadingPack(pack)
    analytics.capture('payment_initiated', { pack, amount })
    try {
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      })
      const order = await res.json()
      if (!order.order_id) throw new Error('Failed to create order')

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://checkout.razorpay.com/v1/checkout.js'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Razorpay'))
        document.head.appendChild(script)
      })

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'InterviewAI',
        description: order.label,
        order_id: order.order_id,
        handler: async (response: Record<string, string>) => {
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          })
          if (verifyRes.ok) {
            analytics.capture('payment_completed', { pack, amount })
            window.location.href = '/dashboard'
          } else {
            alert('Payment verification failed. Please contact support if credits were not added.')
          }
        },
        prefill: { name: '', email: '', contact: '' },
        theme: { color: '#2563eb' },
      })
      rzp.open()
    } catch {
      alert('Payment failed. Please try again.')
    } finally {
      setLoadingPack(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-blue-600 font-medium hover:underline">
            Dashboard →
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            <Zap className="w-3 h-3" /> Simple, honest pricing
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Buy sessions when you need them</h1>
          <p className="text-gray-500 max-w-lg mx-auto">
            No subscription. No monthly bills. Credits never expire — use them at your own pace.
          </p>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-6 mb-12 text-sm text-gray-500">
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-blue-500" /> Credits never expire</span>
          <span className="flex items-center gap-1.5"><RefreshCw className="w-4 h-4 text-blue-500" /> Use across any round type</span>
          <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-blue-500" /> Instant access after payment</span>
        </div>

        {/* Pack cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {PACKS.map((pack) => (
            <div
              key={pack.key}
              className={`rounded-2xl p-6 border transition-shadow hover:shadow-md relative ${
                pack.highlighted
                  ? 'border-blue-500 bg-blue-600 text-white shadow-lg'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {pack.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full ${
                  pack.highlighted ? 'bg-white text-blue-600' : 'bg-gray-900 text-white'
                }`}>
                  {pack.badge}
                </div>
              )}

              <div className="mb-4">
                <div className={`text-sm font-medium mb-1 ${pack.highlighted ? 'text-blue-200' : 'text-gray-500'}`}>
                  {pack.name}
                </div>
                <div className="text-4xl font-bold mb-0.5">{pack.price}</div>
                <div className={`text-sm ${pack.highlighted ? 'text-blue-200' : 'text-gray-500'}`}>
                  {pack.priceNote}
                </div>
                {pack.saving && (
                  <div className={`text-xs font-semibold mt-1.5 ${pack.highlighted ? 'text-blue-100' : 'text-green-600'}`}>
                    {pack.saving}
                  </div>
                )}
              </div>

              <div className={`text-sm font-semibold mb-4 pb-4 border-b ${
                pack.highlighted ? 'text-white border-blue-500' : 'text-gray-800 border-gray-100'
              }`}>
                {pack.sessions} interview session{pack.sessions > 1 ? 's' : ''}
              </div>

              <ul className="space-y-2 mb-6">
                {pack.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${pack.highlighted ? 'text-blue-200' : 'text-green-500'}`} />
                    <span className={pack.highlighted ? 'text-blue-50' : 'text-gray-600'}>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePurchase(pack.key as PackKey, pack.total)}
                disabled={loadingPack === pack.key}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                  pack.highlighted
                    ? 'bg-white text-blue-600 hover:bg-blue-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {loadingPack === pack.key ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {pack.cta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Free tier callout */}
        <div className="bg-gradient-to-r from-blue-50/50 to-white border border-blue-100 rounded-2xl p-6 mb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div>
            <div className="font-semibold text-gray-900 mb-0.5">New here? Start for free</div>
            <div className="text-sm text-gray-500">
              Every new account includes 1 free interview session — no payment needed.
              Try all 4 round types, get a full feedback report, see if it works for you.
            </div>
          </div>
          <Link
            href="/auth/login"
            className="flex-shrink-0 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap shadow-sm"
          >
            Try free →
          </Link>
        </div>

        {/* Per-session comparison table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Cost per session breakdown</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Pack</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Sessions</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Total</th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium">Per session</th>
                <th className="text-right px-6 py-3 text-green-600 font-medium">You save</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="px-6 py-3 text-gray-700">Single</td>
                <td className="px-6 py-3 text-right text-gray-700">1</td>
                <td className="px-6 py-3 text-right text-gray-700">₹249</td>
                <td className="px-6 py-3 text-right text-gray-700">₹249</td>
                <td className="px-6 py-3 text-right text-gray-400">—</td>
              </tr>
              <tr className="border-t border-gray-100 bg-blue-50">
                <td className="px-6 py-3 font-medium text-blue-700">Starter (5)</td>
                <td className="px-6 py-3 text-right text-gray-700">5</td>
                <td className="px-6 py-3 text-right text-gray-700">₹999</td>
                <td className="px-6 py-3 text-right font-medium text-blue-700">₹200</td>
                <td className="px-6 py-3 text-right font-medium text-green-600">₹246 (20%)</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-6 py-3 font-medium text-gray-800">Serious (10)</td>
                <td className="px-6 py-3 text-right text-gray-700">10</td>
                <td className="px-6 py-3 text-right text-gray-700">₹1,799</td>
                <td className="px-6 py-3 text-right font-medium text-gray-800">₹180</td>
                <td className="px-6 py-3 text-right font-medium text-green-600">₹691 (28%)</td>
              </tr>
            </tbody>
          </table>
        </div>

      </main>
    </div>
  )
}

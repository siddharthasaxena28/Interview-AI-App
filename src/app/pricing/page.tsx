'use client'

import { useState } from 'react'
import { CheckCircle, Mic, ArrowRight } from 'lucide-react'
import Link from 'next/link'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void }
  }
}

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  async function handlePayg() {
    setLoadingPlan('payg')
    try {
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 24900 }),
      })
      const order = await res.json()

      if (!order.order_id) throw new Error('Failed to create order')

      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      document.head.appendChild(script)
      script.onload = () => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'InterviewAI',
          description: 'Pay-per-session — 1 Interview',
          order_id: order.order_id,
          handler: async (response: Record<string, string>) => {
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            })
            if (verifyRes.ok) {
              window.location.href = '/dashboard'
            }
          },
          prefill: { name: '', email: '', contact: '' },
          theme: { color: '#2563eb' },
        })
        rzp.open()
      }
    } catch {
      alert('Payment failed. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  async function handleSubscription(plan: 'pro' | 'unlimited') {
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const sub = await res.json()

      if (!sub.subscription_id) throw new Error('Failed to create subscription')

      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      document.head.appendChild(script)
      script.onload = () => {
        const rzp = new window.Razorpay({
          key: sub.key_id,
          subscription_id: sub.subscription_id,
          name: 'InterviewAI',
          description: plan === 'pro' ? 'Pro Plan — ₹399/month' : 'Unlimited Plan — ₹699/month',
          handler: () => {
            window.location.href = '/dashboard'
          },
          prefill: { name: '', email: '', contact: '' },
          theme: { color: '#2563eb' },
        })
        rzp.open()
      }
    } catch {
      alert('Subscription failed. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  const plans = [
    {
      key: 'free',
      name: 'Free',
      price: '₹0',
      period: 'forever',
      sessions: '1 session ever',
      features: ['All 4 round types', 'Full feedback report', 'Selection probability', 'Email report'],
      action: () => window.location.href = '/auth/login',
      cta: 'Get Started',
      highlighted: false,
    },
    {
      key: 'payg',
      name: 'Pay-as-you-go',
      price: '₹249',
      period: 'per session',
      sessions: '1 session',
      features: ['All 4 round types', 'Full feedback report', 'Interview history', 'Shareable link'],
      action: handlePayg,
      cta: 'Buy a Session',
      highlighted: false,
    },
    {
      key: 'pro',
      name: 'Pro',
      price: '₹399',
      period: 'per month',
      sessions: '8 sessions/month',
      features: ['All 4 round types', 'Full feedback report', 'Progress analytics', 'Shareable reports', '₹50/session effective'],
      action: () => handleSubscription('pro'),
      cta: 'Start Pro',
      highlighted: true,
    },
    {
      key: 'unlimited',
      name: 'Unlimited',
      price: '₹699',
      period: 'per month',
      sessions: 'Unlimited sessions',
      features: ['Everything in Pro', 'Unlimited practice', 'Best for active job hunters', '₹35/session (at 20 sessions)'],
      action: () => handleSubscription('unlimited'),
      cta: 'Go Unlimited',
      highlighted: false,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-blue-600 font-medium">Dashboard →</Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Simple, honest pricing</h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Priced for Indian students and professionals. No hidden fees.
            2 PAYG sessions = ₹498 — upgrade to Pro and save.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl p-6 border transition-shadow hover:shadow-md ${
                plan.highlighted
                  ? 'border-blue-500 bg-blue-600 text-white shadow-lg'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {plan.highlighted && (
                <div className="text-xs font-bold bg-white text-blue-600 px-2 py-0.5 rounded-full w-fit mb-3">
                  Most Popular
                </div>
              )}
              <div className="font-bold text-lg mb-1">{plan.name}</div>
              <div className="text-3xl font-bold mb-0.5">{plan.price}</div>
              <div className={`text-sm mb-3 ${plan.highlighted ? 'text-blue-100' : 'text-gray-500'}`}>
                {plan.period}
              </div>
              <div className={`text-sm font-semibold mb-4 ${plan.highlighted ? 'text-blue-100' : 'text-gray-700'}`}>
                {plan.sessions}
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.highlighted ? 'text-blue-200' : 'text-green-500'}`} />
                    <span className={plan.highlighted ? 'text-blue-50' : 'text-gray-700'}>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={plan.action}
                disabled={loadingPlan === plan.key}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                  plan.highlighted
                    ? 'bg-white text-blue-600 hover:bg-blue-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {loadingPlan === plan.key ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {plan.cta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Cost per session comparison</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Sessions / month</th>
                <th className="text-right px-6 py-3 text-gray-600 font-medium">PAYG cost</th>
                <th className="text-right px-6 py-3 text-gray-600 font-medium">Pro cost</th>
                <th className="text-right px-6 py-3 text-green-600 font-medium">Savings with Pro</th>
              </tr>
            </thead>
            <tbody>
              {[
                { sessions: 1, payg: 249, pro: 399, note: 'PAYG cheaper' },
                { sessions: 2, payg: 498, pro: 399, note: 'Save ₹99' },
                { sessions: 4, payg: 996, pro: 399, note: 'Save ₹597' },
                { sessions: 8, payg: 1992, pro: 399, note: 'Save ₹1,593' },
              ].map((row) => (
                <tr key={row.sessions} className="border-t border-gray-100">
                  <td className="px-6 py-3 text-gray-700">{row.sessions} session{row.sessions > 1 ? 's' : ''}</td>
                  <td className="px-6 py-3 text-right text-gray-700">₹{row.payg.toLocaleString('en-IN')}</td>
                  <td className="px-6 py-3 text-right text-gray-700">₹{row.pro.toLocaleString('en-IN')}</td>
                  <td className={`px-6 py-3 text-right font-medium ${row.payg > row.pro ? 'text-green-600' : 'text-gray-400'}`}>
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

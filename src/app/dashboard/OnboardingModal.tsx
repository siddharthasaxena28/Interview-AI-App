'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MessageSquare, BarChart3, X, ArrowRight } from 'lucide-react'

const STORAGE_KEY = 'iai_onboarding_shown'

const STEPS = [
  {
    icon: MessageSquare,
    title: 'Real AI interviewer',
    desc: 'A voice AI asks role-specific questions, probes your answers, and adapts to your level — just like a real interviewer.',
  },
  {
    icon: Mic,
    title: 'Speak naturally',
    desc: 'Just talk. The AI transcribes and evaluates your spoken answers in real-time — no typing required.',
  },
  {
    icon: BarChart3,
    title: 'Detailed scorecard',
    desc: 'Get a scored report with strengths, gaps, communication analysis, and per-question feedback you can act on.',
  },
]

interface Props {
  show: boolean
  userName: string
  creditBalance: number
  needsClaim: boolean
}

export default function OnboardingModal({ show, userName, creditBalance, needsClaim }: Props) {
  const [visible, setVisible] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!show) return
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
  }, [show])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  function startInterview() {
    dismiss()
    router.push('/interview/setup')
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 relative">
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mic className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome, {userName}!
          </h2>
          <p className="text-gray-500 mt-2 text-sm">
            {needsClaim ? (
              <>
                Verify your mobile number to unlock your{' '}
                <span className="font-semibold text-blue-600">free session</span>.
              </>
            ) : (
              <>
                You have{' '}
                <span className="font-semibold text-blue-600">
                  {creditBalance} free {creditBalance === 1 ? 'session' : 'sessions'}
                </span>{' '}
                ready to use.
              </>
            )}
          </p>
        </div>

        <div className="grid gap-4 mb-8">
          {STEPS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 text-sm">{title}</div>
                <p className="text-gray-500 text-sm mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {needsClaim ? (
            // Dismiss to reveal the phone-verification card on the dashboard.
            <button
              onClick={dismiss}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Claim my free session <ArrowRight className="w-4 h-4" />
            </button>
          ) : creditBalance > 0 ? (
            <button
              onClick={startInterview}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Start your first interview <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => { dismiss(); router.push('/pricing') }}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={dismiss}
            className="w-full py-2.5 text-gray-500 text-sm hover:text-gray-700 transition-colors"
          >
            Explore dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Bell, BellRing, Check } from 'lucide-react'
import { isPushSupported, subscribeToPush } from '@/lib/push-client'

type Status = 'idle' | 'working' | 'enabled' | 'denied' | 'error'

export default function EnableReminders() {
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    // Only show if push is supported AND VAPID is configured.
    const configured = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    setSupported(isPushSupported() && configured)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setStatus('enabled')
    }
  }, [])

  if (!supported) return null

  async function enable() {
    setStatus('working')
    const { ok, reason } = await subscribeToPush()
    if (ok) setStatus('enabled')
    else if (reason === 'denied') setStatus('denied')
    else setStatus('error')
  }

  if (status === 'enabled') {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Check className="w-4 h-4" /> Reminders on
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <span className="text-xs text-gray-400">
        Notifications blocked — enable them in your browser settings.
      </span>
    )
  }

  return (
    <button
      onClick={enable}
      disabled={status === 'working'}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-60"
    >
      {status === 'working' ? (
        <>
          <BellRing className="w-4 h-4 animate-pulse" /> Enabling…
        </>
      ) : (
        <>
          <Bell className="w-4 h-4" /> Enable practice reminders
        </>
      )}
    </button>
  )
}

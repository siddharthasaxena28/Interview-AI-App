'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  CreditCard, LogOut, User, FileText, Shield, ChevronDown,
} from 'lucide-react'

interface Props {
  name: string
  email: string
  avatarUrl?: string
  creditBalance: number
  plan: string
}

const planLabels: Record<string, string> = {
  free: 'Free',
  payg: 'Pay-as-you-go',
  pro: 'Pro',
  unlimited: 'Unlimited',
}

export default function UserMenu({ name, email, avatarUrl, creditBalance, plan }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  async function handleSignOut() {
    setOpen(false)
    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch { /* session cleared client-side regardless */ }
    router.push('/')
  }

  const initials = name
    ? name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-50 transition-colors focus:outline-none"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={name}
            width={32}
            height={32}
            className="w-8 h-8 rounded-full ring-2 ring-transparent hover:ring-indigo-500/40 transition-all"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-transparent hover:ring-indigo-500/40 transition-all">
            {initials}
          </div>
        )}
        <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-[120px] truncate">
          {name || 'Account'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">

          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={name} width={36} height={36} className="w-9 h-9 rounded-full" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{name || 'Account'}</div>
                <div className="text-xs text-gray-500 truncate">{email}</div>
              </div>
            </div>
          </div>

          {/* Credits + plan */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span>{creditBalance} credit{creditBalance !== 1 ? 's' : ''} left</span>
              </div>
              <span className="text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">
                {planLabels[plan] ?? plan}
              </span>
            </div>
          </div>

          {/* Nav items */}
          <div className="py-1">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <User className="w-4 h-4 text-gray-400" />
              Account &amp; Billing
            </Link>
            <Link
              href="/privacy"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Shield className="w-4 h-4 text-gray-400" />
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4 text-gray-400" />
              Terms of Service
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t border-gray-200 pt-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mic, CreditCard, CheckCircle, ArrowLeft, Loader2, Trash2 } from 'lucide-react'

interface AccountData {
  user: { email: string; name: string; plan: string; credit_balance: number; referral_code: string }
}

const planLabels: Record<string, string> = {
  free: 'Free',
  payg: 'Pay-as-you-go',
}

export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/account-data')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load account'); setLoading(false) })
  }, [])

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/delete-account', { method: 'POST' })
      if (res.ok) {
        setDeleteSuccess(true)
      } else {
        const body = await res.json() as { error?: string }
        setDeleteError(body.error ?? 'Failed to delete account data. Please try again.')
        setDeleting(false)
      }
    } catch {
      setDeleteError('Network error. Please try again.')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <nav className="border-b border-gray-200 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Mic className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-gray-900">InterviewAI</span>
            </div>
            <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          </div>
        </nav>
        <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          {/* Credits card skeleton */}
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 rounded-2xl p-6">
            <div className="h-4 w-20 bg-indigo-200 rounded animate-pulse mb-5" />
            <div className="flex items-start justify-between mb-6 gap-4">
              <div className="space-y-2">
                <div className="h-6 w-32 bg-indigo-200 rounded-full animate-pulse" />
                <div className="h-3 w-44 bg-indigo-100 rounded animate-pulse" />
              </div>
              <div className="text-right space-y-1.5">
                <div className="h-12 w-14 bg-indigo-200 rounded animate-pulse" />
                <div className="h-3 w-16 bg-indigo-100 rounded animate-pulse ml-auto" />
              </div>
            </div>
            <div className="h-10 w-full bg-indigo-200 rounded-xl animate-pulse" />
          </div>
          {/* Referral card skeleton */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="h-4 w-36 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-3 w-full bg-gray-100 rounded animate-pulse mb-4" />
            <div className="flex gap-2">
              <div className="flex-1 h-10 bg-gray-100 rounded-xl animate-pulse" />
              <div className="h-10 w-24 bg-gray-200 rounded-xl animate-pulse" />
            </div>
          </div>
          {/* Account details skeleton */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <div className="h-3 w-12 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="flex justify-between items-center py-2">
                <div className="h-3 w-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 w-36 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-slate-50 min-h-screen flex items-center justify-center">
        <p className="text-red-600">{error || 'Failed to load account data.'}</p>
      </div>
    )
  }

  const { user } = data
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://interviewai.in'
  const referralLink = `${appUrl}/?ref=${user.referral_code}`
  const lowCredits = user.credit_balance < 2

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Account &amp; Billing</h1>

        {/* Credits & plan */}
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-5 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" /> Credits
          </h2>
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full px-3 py-1 text-xs font-medium">
                  {planLabels[user.plan] ?? user.plan}
                </span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {user.plan === 'free' ? '1 free session included with signup' : 'Credits never expire'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-4xl font-bold text-gray-900 leading-none">{user.credit_balance}</div>
              <div className="text-xs text-gray-500 mt-1">credits left</div>
              {lowCredits && (
                <div className="mt-2 text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded-full font-medium">
                  Running low
                </div>
              )}
            </div>
          </div>
          <Link
            href="/pricing"
            className="block text-center bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Buy more sessions
          </Link>
        </div>

        {/* Referral */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-indigo-600" /> Referral Programme
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Share your link. When a friend signs up and completes their first interview, you both get 1 free session.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 bg-slate-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 font-mono focus:outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={() => navigator.clipboard.writeText(referralLink)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2.5 rounded-xl font-medium transition-colors whitespace-nowrap"
            >
              Copy Link
            </button>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Account Details</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Name</span>
              <span className="text-gray-900 font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Email</span>
              <span className="text-gray-900">{user.email}</span>
            </div>
          </div>
        </div>

        {/* Legal */}
        <div className="text-xs text-gray-400 flex gap-4 px-1">
          <Link href="/privacy" className="hover:text-gray-600 hover:underline transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-600 hover:underline transition-colors">Terms of Service</Link>
        </div>

        {/* Danger zone */}
        <div className={`rounded-2xl p-6 ${deleteSuccess ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          {deleteSuccess ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="font-semibold text-gray-900 mb-2">Data deleted successfully</h2>
              <p className="text-sm text-gray-600 mb-6">
                Your interview history, transcripts, feedback reports, and personal profile
                have been permanently removed. Your remaining credits are still here if you return.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-red-600 mb-1 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Danger Zone
              </h2>
              <p className="text-sm text-gray-600 mb-2">
                Deletes your personal data — interview transcripts, feedback reports, session
                history, focus areas, and profile information (name, email, photo).
                This action <strong className="text-gray-900">cannot be undone</strong>.
              </p>
              <p className="text-sm text-gray-600 mb-4">
                <strong className="text-gray-900">What is kept:</strong> your remaining credit balance and payment records —
                so if you return, your unused credits are still here. See our{' '}
                <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>{' '}
                for full details.
              </p>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-4 py-2.5 rounded-xl transition-colors font-medium"
                >
                  Delete my data
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-red-600 font-medium">
                    Type <code className="bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-mono text-red-700">DELETE</code> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-300 font-mono"
                    autoFocus
                  />
                  {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
                  <div className="flex gap-3">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || deleting}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {deleting ? 'Deleting…' : 'Permanently delete'}
                    </button>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError('') }}
                      className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

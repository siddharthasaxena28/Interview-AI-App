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
      <div className="bg-[#0a0a0f] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-[#0a0a0f] min-h-screen flex items-center justify-center">
        <p className="text-red-400">{error || 'Failed to load account data.'}</p>
      </div>
    )
  }

  const { user } = data
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://interviewai.in'
  const referralLink = `${appUrl}/?ref=${user.referral_code}`
  const lowCredits = user.credit_balance < 2

  return (
    <div className="bg-[#0a0a0f] min-h-screen">
      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-white">Account &amp; Billing</h1>

        {/* Credits & plan */}
        <div className="bg-gradient-to-br from-indigo-600/10 to-violet-600/5 border border-indigo-500/20 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-5 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-400" /> Credits
          </h2>
          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium">
                  {planLabels[user.plan] ?? user.plan}
                </span>
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {user.plan === 'free' ? '1 free session included with signup' : 'Credits never expire'}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-4xl font-bold text-white leading-none">{user.credit_balance}</div>
              <div className="text-xs text-gray-500 mt-1">credits left</div>
              {lowCredits && (
                <div className="mt-2 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-full font-medium">
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
        <div className="bg-[#111118] border border-white/[0.06] rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-indigo-400" /> Referral Programme
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Share your link. When a friend signs up and completes their first interview, you both get 1 free session.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 bg-[#0a0a0f] border border-white/[0.10] rounded-xl px-3 py-2.5 text-sm text-gray-300 font-mono focus:outline-none focus:border-indigo-500/50"
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
        <div className="bg-[#111118] border border-white/[0.06] rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-4">Account Details</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
              <span className="text-gray-400">Name</span>
              <span className="text-white font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-400">Email</span>
              <span className="text-white">{user.email}</span>
            </div>
          </div>
        </div>

        {/* Legal */}
        <div className="text-xs text-gray-600 flex gap-4 px-1">
          <Link href="/privacy" className="hover:text-gray-400 hover:underline transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-400 hover:underline transition-colors">Terms of Service</Link>
        </div>

        {/* Danger zone */}
        <div className={`rounded-2xl p-6 ${deleteSuccess ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-red-500/5 border border-red-500/20'}`}>
          {deleteSuccess ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="font-semibold text-white mb-2">Data deleted successfully</h2>
              <p className="text-sm text-gray-400 mb-6">
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
              <h2 className="font-semibold text-red-400 mb-1 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Danger Zone
              </h2>
              <p className="text-sm text-gray-400 mb-2">
                Deletes your personal data — interview transcripts, feedback reports, session
                history, focus areas, and profile information (name, email, photo).
                This action <strong className="text-gray-200">cannot be undone</strong>.
              </p>
              <p className="text-sm text-gray-400 mb-4">
                <strong className="text-gray-200">What is kept:</strong> your remaining credit balance and payment records —
                so if you return, your unused credits are still here. See our{' '}
                <Link href="/privacy" className="text-indigo-400 hover:underline">Privacy Policy</Link>{' '}
                for full details.
              </p>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-4 py-2.5 rounded-xl transition-colors font-medium"
                >
                  Delete my data
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-red-400 font-medium">
                    Type <code className="bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-mono text-red-300">DELETE</code> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-[#0a0a0f] border border-white/[0.10] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 font-mono"
                    autoFocus
                  />
                  {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
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
                      className="text-sm text-gray-500 hover:text-gray-300 px-4 py-2.5 transition-colors"
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

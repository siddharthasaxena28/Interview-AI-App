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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error || 'Failed to load account data.'}</p>
      </div>
    )
  }

  const { user } = data
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://interviewai.in'
  const referralLink = `${appUrl}/?ref=${user.referral_code}`

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">InterviewAI</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Account & Billing</h1>

        {/* Credits & plan */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" /> Credits
          </h2>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xl font-bold text-gray-900">{planLabels[user.plan] ?? user.plan}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {user.plan === 'free' ? '1 free session included with signup' : 'Credits never expire'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">{user.credit_balance}</div>
              <div className="text-xs text-gray-400">credits left</div>
            </div>
          </div>
          <Link
            href="/pricing"
            className="block text-center bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Buy more sessions
          </Link>
        </div>

        {/* Referral */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" /> Referral Programme
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Share your link. When a friend signs up and completes their first interview, you both get 1 free session.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-gray-50 font-mono"
            />
            <button
              onClick={() => navigator.clipboard.writeText(referralLink)}
              className="bg-blue-600 text-white text-sm px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              Copy Link
            </button>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Account Details</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="text-gray-900 font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-900">{user.email}</span>
            </div>
          </div>
        </div>

        {/* Legal */}
        <div className="text-xs text-gray-400 flex gap-4 px-1">
          <Link href="/privacy" className="hover:text-gray-600 hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-600 hover:underline">Terms of Service</Link>
        </div>

        {/* Danger zone */}
        <div className={`bg-white rounded-xl border p-6 ${deleteSuccess ? 'border-green-200' : 'border-red-200'}`}>
          {deleteSuccess ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="font-semibold text-gray-900 mb-2">Data deleted successfully</h2>
              <p className="text-sm text-gray-500 mb-6">
                Your interview history, transcripts, feedback reports, and personal profile
                have been permanently removed. Your remaining credits are still here if you return.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-semibold text-red-700 mb-1 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Danger Zone
              </h2>
              <p className="text-sm text-gray-500 mb-2">
                Deletes your personal data — interview transcripts, feedback reports, session
                history, focus areas, and profile information (name, email, photo).
                This action <strong>cannot be undone</strong>.
              </p>
              <p className="text-sm text-gray-500 mb-4">
                <strong>What is kept:</strong> your remaining credit balance and payment records —
                so if you return, your unused credits are still here. See our{' '}
                <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>{' '}
                for full details.
              </p>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-600 border border-red-200 px-4 py-2.5 rounded-xl hover:bg-red-50 transition-colors font-medium"
                >
                  Delete my data
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-red-700 font-medium">
                    Type <code className="bg-red-50 px-1.5 py-0.5 rounded font-mono">DELETE</code> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full border border-red-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
                    autoFocus
                  />
                  {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
                  <div className="flex gap-3">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || deleting}
                      className="flex items-center gap-2 bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

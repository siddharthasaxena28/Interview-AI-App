'use client'

import { useState } from 'react'

export function CopyReferral({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(link)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => { /* silent — user can copy from the input field */ })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={link}
        className="flex-1 bg-slate-50 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-600 font-mono truncate focus:outline-none"
      />
      <button
        onClick={handleCopy}
        className={`text-sm px-4 py-2 rounded-xl font-medium transition-all duration-200 whitespace-nowrap ${
          copied
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  )
}

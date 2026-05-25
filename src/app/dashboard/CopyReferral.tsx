'use client'

import { useState } from 'react'

export function CopyReferral({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={link}
        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 font-mono truncate"
      />
      <button
        onClick={handleCopy}
        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  )
}

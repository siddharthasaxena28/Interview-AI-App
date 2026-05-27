'use client'

import { useEffect } from 'react'

// Silently loads FingerprintJS OSS (keyless, fully client-side) and stores
// the visitor ID on the user row via /api/fingerprint. No UI, no blocking.
// The fingerprint is only used as a soft anti-abuse signal for future use.
export default function FingerprintCapture() {
  useEffect(() => {
    import('@fingerprintjs/fingerprintjs')
      .then(FP => FP.load())
      .then(fp => fp.get())
      .then(res => {
        fetch('/api/fingerprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId: res.visitorId }),
        }).catch(() => {})
      })
      .catch(() => {})
  }, [])

  return null
}

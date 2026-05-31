'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/push-client'

/** Registers the service worker once on load. Renders nothing. */
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    registerServiceWorker()
  }, [])
  return null
}

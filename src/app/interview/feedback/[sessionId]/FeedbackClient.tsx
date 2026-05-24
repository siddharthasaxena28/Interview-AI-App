'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function FeedbackClient({ sessionId }: { sessionId: string }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, 5000)
    return () => clearInterval(interval)
  }, [router])

  return null
}

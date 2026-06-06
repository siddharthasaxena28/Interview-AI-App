'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  score: number
  max?: number
  label: string
  sublabel?: string
  format?: 'number' | 'percent'
  size?: number
}

export default function ScoreRing({ score, max = 100, label, sublabel, format = 'number', size = 130 }: Props) {
  const pct = Math.min(1, Math.max(0, score / max))
  const r = 38
  const circ = 2 * Math.PI * r

  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 1000

    function animate(now: number) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.round(score * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [score])

  const filledPct = Math.min(1, Math.max(0, displayed / max))
  const filled = filledPct * circ

  const stroke = pct >= 0.75 ? '#22c55e' : pct >= 0.5 ? '#f59e0b' : '#ef4444'
  const textColor = pct >= 0.75 ? 'text-emerald-600' : pct >= 0.5 ? 'text-amber-600' : 'text-red-600'
  const display = format === 'percent' ? `${displayed}%` : `${displayed}`

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className={`text-2xl font-bold leading-none ${textColor}`}>{display}</span>
          {format === 'number' && (
            <span className="text-[10px] text-gray-400 mt-0.5 font-medium">/ {max}</span>
          )}
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        {sublabel && <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>}
      </div>
    </div>
  )
}

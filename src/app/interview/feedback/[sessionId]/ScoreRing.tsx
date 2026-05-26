interface Props {
  score: number
  max?: number
  label: string
  sublabel?: string
  format?: 'number' | 'percent'
  size?: number
}

export default function ScoreRing({ score, max = 100, label, sublabel, format = 'number', size = 120 }: Props) {
  const pct = Math.min(1, Math.max(0, score / max))
  const r = 40
  const circ = 2 * Math.PI * r
  const filled = pct * circ

  const stroke = pct >= 0.8 ? '#22c55e' : pct >= 0.6 ? '#f59e0b' : '#ef4444'
  const display = format === 'percent' ? `${score}%` : `${score}`
  const sub = format === 'percent' ? '' : `/ ${max}`

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          {/* Track ring */}
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          {/* Progress arc — rotated so it starts at 12 o'clock */}
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
        {/* Centred text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-2xl font-bold leading-none" style={{ color: stroke }}>{display}</span>
          {sub && <span className="text-xs text-gray-400 mt-0.5">{sub}</span>}
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-gray-700">{label}</div>
        {sublabel && <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>}
      </div>
    </div>
  )
}

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
  const filled = pct * circ

  const stroke = pct >= 0.75 ? '#34d399' : pct >= 0.5 ? '#fbbf24' : '#f87171'
  const trackStroke = 'rgba(255,255,255,0.06)'
  const display = format === 'percent' ? `${score}%` : `${score}`
  const sub = format === 'percent' ? '' : `/ ${max}`

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke={trackStroke} strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`}
            transform="rotate(-90 50 50)"
            style={{ filter: `drop-shadow(0 0 6px ${stroke}60)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-2xl font-bold leading-none" style={{ color: stroke }}>{display}</span>
          {sub && <span className="text-[10px] text-gray-600 mt-0.5 font-medium">{sub}</span>}
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-white">{label}</div>
        {sublabel && <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>}
      </div>
    </div>
  )
}

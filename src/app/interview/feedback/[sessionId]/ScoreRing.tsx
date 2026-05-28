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

  // Softer color palette — blue replaces harsh red for low scores
  const stroke = pct >= 0.75 ? '#16a34a' : pct >= 0.5 ? '#d97706' : '#3b82f6'
  const trackStroke = pct >= 0.75 ? '#dcfce7' : pct >= 0.5 ? '#fef3c7' : '#dbeafe'
  const display = format === 'percent' ? `${score}%` : `${score}`
  const sub = format === 'percent' ? '' : `/ ${max}`

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative drop-shadow-sm" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          {/* Coloured track */}
          <circle cx="50" cy="50" r={r} fill="none" stroke={trackStroke} strokeWidth="10" />
          {/* Progress arc */}
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <span className="text-2xl font-bold leading-none" style={{ color: stroke }}>{display}</span>
          {sub && <span className="text-[10px] text-gray-400 mt-0.5 font-medium">{sub}</span>}
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
      </div>
    </div>
  )
}

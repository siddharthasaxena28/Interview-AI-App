'use client'

import { Download, Linkedin, MessageCircle } from 'lucide-react'

interface ScoreCardProps {
  company: string
  role: string
  roundLabel: string
  overallScore: number
  selectionProbability: number
  appUrl: string
  shareUrl: string
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function scoreToColor(score: number): string {
  if (score >= 75) return '#22c55e'   // green-500
  if (score >= 50) return '#f59e0b'   // amber-500
  return '#ef4444'                     // red-500
}

export default function ScoreCard({
  company,
  role,
  roundLabel,
  overallScore,
  selectionProbability,
  appUrl,
  shareUrl,
}: ScoreCardProps) {
  function downloadCard() {
    const W = 1200
    const H = 630
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Dark gradient background
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#0f172a')   // slate-900
    bg.addColorStop(1, '#1e3a5f')   // deep blue
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let y = 0; y < H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Top bar: logo + label
    ctx.fillStyle = '#3b82f6'   // blue-500
    ctx.beginPath()
    ctx.roundRect(60, 48, 44, 44, 10)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillText('AI', 72, 76)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 26px system-ui, sans-serif'
    ctx.fillText('InterviewAI', 120, 76)

    ctx.fillStyle = '#94a3b8'   // slate-400
    ctx.font = '18px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('Mock Interview Result', W - 60, 76)
    ctx.textAlign = 'left'

    // Separator line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(60, 110); ctx.lineTo(W - 60, 110); ctx.stroke()

    // Company + Role
    ctx.fillStyle = '#e2e8f0'   // slate-200
    ctx.font = '500 32px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${company} — ${role}`, W / 2, 180)

    // Round label chip
    const chipText = roundLabel
    ctx.font = '600 18px system-ui, sans-serif'
    const chipW = ctx.measureText(chipText).width + 32
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)'
    ctx.beginPath()
    ctx.roundRect(W / 2 - chipW / 2, 196, chipW, 34, 17)
    ctx.fill()
    ctx.fillStyle = '#93c5fd'   // blue-300
    ctx.fillText(chipText, W / 2, 220)

    // Score section — two big numbers side by side
    const scoreColor = scoreToColor(overallScore)
    const probColor = scoreToColor(selectionProbability)

    // Left card: Overall Score
    const cardY = 270
    const cardH = 200
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.roundRect(120, cardY, 420, cardH, 20)
    ctx.fill()

    ctx.fillStyle = scoreColor
    ctx.font = 'bold 96px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${overallScore}`, 330, cardY + 118)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '18px system-ui, sans-serif'
    ctx.fillText('Overall Score / 100', 330, cardY + 158)

    // Right card: Selection Probability
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.roundRect(660, cardY, 420, cardH, 20)
    ctx.fill()

    ctx.fillStyle = probColor
    ctx.font = 'bold 96px system-ui, sans-serif'
    ctx.fillText(`${selectionProbability}%`, 870, cardY + 118)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '18px system-ui, sans-serif'
    ctx.fillText('Chance of Selection', 870, cardY + 158)

    // Bottom
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(60, H - 80); ctx.lineTo(W - 60, H - 80); ctx.stroke()

    ctx.fillStyle = '#64748b'   // slate-500
    ctx.font = '20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`Practise like it\'s real · ${appUrl.replace('https://', '')}`, W / 2, H - 40)

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `interview-scorecard-${company.toLowerCase().replace(/\s+/g, '-')}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function shareOnLinkedIn() {
    const performanceEmoji = selectionProbability >= 75 ? '🔥' : selectionProbability >= 55 ? '💪' : '📈'
    const performanceLine =
      selectionProbability >= 75
        ? 'Strong performance — feeling confident about the real thing!'
        : selectionProbability >= 55
        ? 'Decent run — identified key areas to sharpen before the real interview.'
        : 'Great learning experience — pinpointed exactly where to improve.'

    // Opening the LinkedIn post composer with pre-written text.
    // Including the report URL in the body text triggers LinkedIn's link-card
    // detection, which pulls the og:image (the scorecard graphic) automatically.
    const text = [
      `${performanceEmoji} Just completed a mock interview on InterviewAI!`,
      '',
      `🏢 Company: ${company}`,
      `💼 Role: ${role}`,
      `📊 Round: ${roundLabel}`,
      '',
      `📈 My Results:`,
      `   • Overall Score: ${overallScore} / 100`,
      `   • Chance of Selection: ${selectionProbability}%`,
      '',
      performanceLine,
      '',
      `View my full feedback report 👇`,
      shareUrl,
      '',
      `If you're prepping for interviews, give InterviewAI a try — it's free to start.`,
      '',
      `#InterviewPrep #MockInterview #CareerGrowth #JobSearch #TechInterview`,
    ].join('\n')

    // feed/?shareActive=true pre-fills the LinkedIn post composer with the text.
    window.open(
      `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer,width=700,height=600'
    )
  }

  function shareOnWhatsApp() {
    const emoji = selectionProbability >= 75 ? '🔥' : selectionProbability >= 55 ? '💪' : '📈'
    const text = [
      `${emoji} Mock interview result — InterviewAI`,
      '',
      `🏢 ${company} — ${role}`,
      `📊 ${roundLabel}`,
      '',
      `Overall Score: ${overallScore}/100`,
      `Selection probability: ${selectionProbability}%`,
      '',
      `Full report: ${shareUrl}`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={downloadCard}
        className="flex items-center justify-center gap-2 border border-gray-200 bg-slate-50 text-gray-700 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-100 hover:border-gray-300 transition-colors"
      >
        <Download className="w-4 h-4" /> Download Score Card
      </button>
      <button
        onClick={shareOnLinkedIn}
        className="flex items-center justify-center gap-2 bg-[#0077b5] text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#006097] transition-colors"
      >
        <Linkedin className="w-4 h-4" /> Share on LinkedIn
      </button>
      <button
        onClick={shareOnWhatsApp}
        className="flex items-center justify-center gap-2 bg-[#25d366] text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#1fbb58] transition-colors"
      >
        <MessageCircle className="w-4 h-4" /> Share on WhatsApp
      </button>
    </div>
  )
}

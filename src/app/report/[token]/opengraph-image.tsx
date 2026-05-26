import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function scoreColor(n: number) {
  if (n >= 75) return '#22c55e'
  if (n >= 50) return '#f59e0b'
  return '#ef4444'
}

export default async function Image({ params }: { params: { token: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('feedback_reports')
    .select('overall_score, selection_probability, interview_sessions(company, role, round_type)')
    .eq('share_token', params.token)
    .single()

  const appDomain = (process.env.NEXT_PUBLIC_APP_URL ?? 'interviewai.app').replace(/^https?:\/\//, '')

  if (!data) {
    return new ImageResponse(
      <div
        style={{
          background: '#0f172a',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 28,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        InterviewAI Report
      </div>,
      { width: 1200, height: 630 }
    )
  }

  const session = data.interview_sessions as unknown as { company: string; role: string; round_type: string } | null
  const company = session?.company ?? 'Company'
  const role = session?.role ?? 'Role'
  const score = data.overall_score as number
  const prob = data.selection_probability as number

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '56px 64px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        position: 'relative',
      }}
    >
      {/* Grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              background: '#3b82f6',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '22px',
            }}
          >
            AI
          </div>
          <span style={{ color: 'white', fontWeight: 'bold', fontSize: '26px' }}>InterviewAI</span>
        </div>
        <span style={{ color: '#94a3b8', fontSize: '18px' }}>Mock Interview Result</span>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: '36px', display: 'flex' }} />

      {/* Company + Role */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' }}>
        <div style={{ color: '#e2e8f0', fontSize: '30px', fontWeight: '500', textAlign: 'center', marginBottom: '14px' }}>
          {company} — {role}
        </div>
        <div
          style={{
            background: 'rgba(59,130,246,0.25)',
            color: '#93c5fd',
            padding: '8px 28px',
            borderRadius: '20px',
            fontSize: '16px',
            fontWeight: '600',
            display: 'flex',
          }}
        >
          Interview Scorecard
        </div>
      </div>

      {/* Score cards */}
      <div style={{ display: 'flex', gap: '36px', flex: 1 }}>
        {/* Overall Score */}
        <div
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
          }}
        >
          <div style={{ color: scoreColor(score), fontSize: '108px', fontWeight: 'bold', lineHeight: '1' }}>
            {score}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '18px', marginTop: '12px' }}>Overall Score / 100</div>
        </div>

        {/* Selection Probability */}
        <div
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
          }}
        >
          <div style={{ color: scoreColor(prob), fontSize: '108px', fontWeight: 'bold', lineHeight: '1' }}>
            {prob}%
          </div>
          <div style={{ color: '#94a3b8', fontSize: '18px', marginTop: '12px' }}>Chance of Selection</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
        <span style={{ color: '#64748b', fontSize: '18px' }}>
          Practise like it&apos;s real · {appDomain}
        </span>
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}

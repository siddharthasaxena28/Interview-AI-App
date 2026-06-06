import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #eef2ff 0%, #ffffff 50%, #f5f3ff 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
      }}
    >
      {/* Subtle dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.12) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Logo mark */}
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '20px',
          background: '#6366f1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '28px',
          boxShadow: '0 8px 32px rgba(99,102,241,0.35)',
        }}
      >
        <div style={{ color: 'white', fontWeight: 'bold', fontSize: '28px', display: 'flex' }}>AI</div>
      </div>

      {/* Brand name */}
      <div style={{ color: '#111827', fontWeight: 'bold', fontSize: '56px', marginBottom: '20px', display: 'flex' }}>
        InterviewAI
      </div>

      {/* Tagline */}
      <div style={{ color: '#6b7280', fontSize: '26px', marginBottom: '40px', display: 'flex' }}>
        Practice like it&apos;s real. Perform when it matters.
      </div>

      {/* Pill badges */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {['Voice Interview Simulation', 'AI Feedback', 'Indian Job Market'].map(label => (
          <div
            key={label}
            style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: '#4f46e5',
              padding: '10px 22px',
              borderRadius: '999px',
              fontSize: '18px',
              fontWeight: '600',
              display: 'flex',
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}

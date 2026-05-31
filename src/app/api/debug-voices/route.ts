import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 503 })

  // Fetch all voices from the account
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `ElevenLabs returned ${res.status}` }, { status: 502 })
  }

  const data = await res.json() as { voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> }

  return NextResponse.json({
    total_voices: data.voices.length,
    voices: data.voices.map(v => ({ id: v.voice_id, name: v.name })),
    env_vars: {
      ELEVENLABS_VOICE_TECH_L1:      process.env.ELEVENLABS_VOICE_TECH_L1      ?? '(not set)',
      ELEVENLABS_VOICE_TECH_L1_F:    process.env.ELEVENLABS_VOICE_TECH_L1_F    ?? '(not set)',
      ELEVENLABS_VOICE_TECH_L2:      process.env.ELEVENLABS_VOICE_TECH_L2      ?? '(not set)',
      ELEVENLABS_VOICE_TECH_L2_F:    process.env.ELEVENLABS_VOICE_TECH_L2_F    ?? '(not set)',
      ELEVENLABS_VOICE_MANAGERIAL:   process.env.ELEVENLABS_VOICE_MANAGERIAL   ?? '(not set)',
      ELEVENLABS_VOICE_MANAGERIAL_F: process.env.ELEVENLABS_VOICE_MANAGERIAL_F ?? '(not set)',
      ELEVENLABS_VOICE_HR:           process.env.ELEVENLABS_VOICE_HR            ?? '(not set)',
      ELEVENLABS_VOICE_HR_F:         process.env.ELEVENLABS_VOICE_HR_F          ?? '(not set)',
    },
  })
}

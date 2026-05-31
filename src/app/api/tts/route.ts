import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundType } from '@/types'

export const dynamic = 'force-dynamic'

// Fallback voice — used only when no env var is configured for a round
const FALLBACK_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam

// Server-side voice ID resolution — env vars are only available here, not in client components
const VOICE_MAP: Record<string, { male: string | undefined; female: string | undefined }> = {
  tech_l1:    { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
  tech_l2:    { male: process.env.ELEVENLABS_VOICE_TECH_L2,    female: process.env.ELEVENLABS_VOICE_TECH_L2_F },
  managerial: { male: process.env.ELEVENLABS_VOICE_MANAGERIAL, female: process.env.ELEVENLABS_VOICE_MANAGERIAL_F },
  hr:         { male: process.env.ELEVENLABS_VOICE_HR,         female: process.env.ELEVENLABS_VOICE_HR_F },
  full_loop:  { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
}

function resolveVoiceId(roundType: string | undefined, gender: string | undefined): string {
  const entry = VOICE_MAP[roundType ?? '']
  if (!entry) return FALLBACK_VOICE_ID
  const id = gender === 'female' ? (entry.female ?? entry.male) : entry.male
  return id || FALLBACK_VOICE_ID
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { text: rawText, round_type, gender, voice_id } = await request.json() as {
      text: string
      round_type?: RoundType
      gender?: string
      voice_id?: string  // legacy — kept for backwards compatibility
    }

    if (!rawText) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    // Cap text length to limit per-call ElevenLabs cost and prevent abuse
    const text = rawText.slice(0, 500)

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
    }

    // Prefer server-side resolution (round_type + gender); fall back to explicit voice_id for legacy callers
    const resolvedVoiceId = round_type
      ? resolveVoiceId(round_type, gender)
      : (!voice_id || voice_id === 'default' ? FALLBACK_VOICE_ID : voice_id)

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    )

    if (!response.ok) {
      const detail = await response.text()
      console.error('ElevenLabs error:', response.status, detail)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
    }

    const audioBuffer = await response.arrayBuffer()

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('TTS route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

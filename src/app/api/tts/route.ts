import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Fallback ElevenLabs voice IDs (premade voices, no subscription needed)
const FALLBACK_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam — neutral male, clear accent

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { text: rawText, voice_id } = await request.json() as { text: string; voice_id: string }

    if (!rawText) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    // Cap text length to limit per-call ElevenLabs cost and prevent abuse
    const text = rawText.slice(0, 500)

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
    }

    // Use fallback voice if none configured
    const resolvedVoiceId = (!voice_id || voice_id === 'default') ? FALLBACK_VOICE_ID : voice_id

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

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundType } from '@/types'

export const dynamic = 'force-dynamic'

// Pre-made ElevenLabs voices that work without adding to "My Voices"
// Used ONLY when the configured voice fails — keeps audio on ElevenLabs (not browser)
const FALLBACK_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam (ElevenLabs pre-made)

// Resolved fresh on every request — never cached at module level
function getVoiceId(roundType: string | undefined, gender: string | undefined): string {
  // Read env vars here (inside the function) so they're always fresh
  const map: Record<string, { male: string | undefined; female: string | undefined }> = {
    tech_l1:    { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
    tech_l2:    { male: process.env.ELEVENLABS_VOICE_TECH_L2,    female: process.env.ELEVENLABS_VOICE_TECH_L2_F },
    managerial: { male: process.env.ELEVENLABS_VOICE_MANAGERIAL, female: process.env.ELEVENLABS_VOICE_MANAGERIAL_F },
    hr:         { male: process.env.ELEVENLABS_VOICE_HR,         female: process.env.ELEVENLABS_VOICE_HR_F },
    full_loop:  { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
  }

  const entry = map[roundType ?? '']
  if (!entry) {
    console.warn(`[TTS] No voice map entry for round_type="${roundType}" — using fallback`)
    return FALLBACK_VOICE_ID
  }

  const id = gender === 'female' ? (entry.female ?? entry.male) : entry.male
  if (!id) {
    console.warn(`[TTS] No voice ID configured for round_type="${roundType}" gender="${gender}" — using fallback`)
    return FALLBACK_VOICE_ID
  }

  return id
}

async function callElevenLabs(voiceId: string, text: string, apiKey: string): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
  })
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
      voice_id?: string // legacy
    }

    if (!rawText) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    const text = rawText.slice(0, 500)

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      console.error('[TTS] ELEVENLABS_API_KEY not set')
      return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
    }

    // Resolve voice ID — prefer round_type+gender (server-side), fall back to explicit voice_id
    const primaryVoiceId = round_type
      ? getVoiceId(round_type, gender)
      : (voice_id && voice_id !== 'default' ? voice_id : FALLBACK_VOICE_ID)

    console.log(`[TTS] round_type=${round_type} gender=${gender} → voiceId=${primaryVoiceId}`)

    // Try primary voice
    let response = await callElevenLabs(primaryVoiceId, text, apiKey)

    // If primary voice fails (e.g. not added to My Voices), retry with fallback ElevenLabs voice
    if (!response.ok && primaryVoiceId !== FALLBACK_VOICE_ID) {
      const errBody = await response.text()
      console.error(`[TTS] Primary voice ${primaryVoiceId} failed (${response.status}): ${errBody}`)
      console.warn(`[TTS] Retrying with fallback voice ${FALLBACK_VOICE_ID}`)
      response = await callElevenLabs(FALLBACK_VOICE_ID, text, apiKey)
    }

    if (!response.ok) {
      const detail = await response.text()
      console.error(`[TTS] ElevenLabs error (${response.status}): ${detail}`)
      return NextResponse.json({ error: 'TTS generation failed', detail }, { status: 502 })
    }

    const audioBuffer = await response.arrayBuffer()

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Voice-Id': primaryVoiceId, // useful for debugging in browser devtools
      },
    })
  } catch (error) {
    console.error('[TTS] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

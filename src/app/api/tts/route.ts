import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundType } from '@/types'

export const dynamic = 'force-dynamic'

// Explicit voice IDs per round + gender — set these in Vercel env vars
const ENV_VOICE_MAP: Record<string, { male: string | undefined; female: string | undefined }> = {
  tech_l1:    { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
  tech_l2:    { male: process.env.ELEVENLABS_VOICE_TECH_L2,    female: process.env.ELEVENLABS_VOICE_TECH_L2_F },
  managerial: { male: process.env.ELEVENLABS_VOICE_MANAGERIAL, female: process.env.ELEVENLABS_VOICE_MANAGERIAL_F },
  hr:         { male: process.env.ELEVENLABS_VOICE_HR,         female: process.env.ELEVENLABS_VOICE_HR_F },
  full_loop:  { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
}

function pickVoiceId(roundType: string | undefined, gender: string | undefined): string | null {
  const entry = ENV_VOICE_MAP[roundType ?? '']
  if (!entry) return null
  return gender === 'female'
    ? (entry.female ?? entry.male ?? null)
    : (entry.male ?? entry.female ?? null)
}

// Models ordered: free tier first, paid tiers last
const MODELS = [
  'eleven_flash_v2_5',
  'eleven_flash_v2',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_multilingual_v2',
  'eleven_monolingual_v1',
]

async function generateSpeech(voiceId: string, text: string, apiKey: string): Promise<{ response: Response; model: string }> {
  for (const model of MODELS) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
    })

    if (res.ok) {
      console.log(`[TTS] OK — model=${model} voice=${voiceId}`)
      return { response: res, model }
    }

    // 401 = bad API key, 404 = voice not found — no point trying more models
    if (res.status === 401 || res.status === 404) {
      const body = await res.text()
      console.error(`[TTS] ${res.status} on model=${model} voice=${voiceId}: ${body.slice(0, 200)}`)
      return { response: res, model }
    }

    const body = await res.text()
    console.warn(`[TTS] ${res.status} on model=${model}: ${body.slice(0, 150)} — trying next model`)
  }

  // All models exhausted — return last failure
  const lastRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODELS[0] }),
  })
  return { response: lastRes, model: MODELS[0] }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { text: rawText, round_type, gender, voice_id } = await request.json() as {
      text: string
      round_type?: RoundType
      gender?: string
      voice_id?: string
    }

    if (!rawText) return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    const text = rawText.slice(0, 2000)

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      console.error('[TTS] ELEVENLABS_API_KEY is not set')
      return NextResponse.json({ error: 'TTS not configured', detail: 'ELEVENLABS_API_KEY missing' }, { status: 503 })
    }

    // Resolve voice ID — env vars only, no account lookup
    const voiceIdToUse = voice_id && voice_id !== 'default'
      ? voice_id
      : pickVoiceId(round_type, gender)

    if (!voiceIdToUse) {
      const detail = `No voice configured for round_type="${round_type}" gender="${gender}". Set ELEVENLABS_VOICE_* env vars in Vercel.`
      console.error(`[TTS] ${detail}`)
      return NextResponse.json({ error: 'TTS not configured', detail }, { status: 503 })
    }

    const { response, model: modelUsed } = await generateSpeech(voiceIdToUse, text, apiKey)

    if (!response.ok) {
      const body = await response.text()
      const detail = response.status === 401
        ? 'ELEVENLABS_API_KEY is invalid — update it in Vercel → Settings → Environment Variables'
        : response.status === 404
        ? `Voice ID "${voiceIdToUse}" not found — check the ELEVENLABS_VOICE_* env vars in Vercel`
        : `ElevenLabs error ${response.status}: ${body.slice(0, 200)}`
      console.error(`[TTS] Failed: ${detail}`)
      return NextResponse.json({ error: 'TTS generation failed', detail }, { status: 502 })
    }

    const audioBuffer = await response.arrayBuffer()
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Voice-Id': voiceIdToUse,
        'X-TTS-Model': modelUsed,
      },
    })
  } catch (error) {
    console.error('[TTS] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

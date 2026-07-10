import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { waitUntil } from '@vercel/functions'
import { createServiceClient } from '@/lib/supabase-server'
import { withAuth, apiError } from '@/lib/api-handler'
import type { RoundType } from '@/types'

export const dynamic = 'force-dynamic'

// Storage-backed audio cache. Interviewer phrases repeat heavily across
// sessions (intros, transitions, thinking-time prompts), so each unique
// (voice, text) pair is synthesized on ElevenLabs exactly once and served
// from Supabase Storage afterwards. Bump the version to invalidate the
// cache if voice_settings in generateSpeech() ever change.
const TTS_CACHE_BUCKET = 'tts-cache'
const TTS_CACHE_VERSION = 'v1'

function cachePath(voiceId: string, text: string): string {
  const hash = createHash('sha256')
    .update(`${TTS_CACHE_VERSION}|${voiceId}|${text}`)
    .digest('hex')
  return `${TTS_CACHE_VERSION}/${voiceId}/${hash}.mp3`
}

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

    const body = await res.text()

    // Any 4xx is a client error — retrying with a different model won't fix it
    if (res.status >= 400 && res.status < 500) {
      console.error(`[TTS] ${res.status} on model=${model} voice=${voiceId}: ${body.slice(0, 300)}`)
      return { response: new Response(body, { status: res.status }), model }
    }

    // 5xx — try next model
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

// The catch stays inline (rather than falling through to withAuth's generic 500)
// so unexpected failures keep returning the debugging `detail` field.
export const POST = withAuth('tts', async ({ request }) => {
  try {
    const { text: rawText, round_type, gender, voice_id } = await request.json() as {
      text: string
      round_type?: RoundType
      gender?: string
      voice_id?: string
    }

    if (!rawText) return apiError('Missing text', 400)
    const text = rawText.slice(0, 2000)

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      console.error('[TTS] ELEVENLABS_API_KEY is not set')
      return apiError('TTS not configured', 503, { detail: 'ELEVENLABS_API_KEY missing' })
    }

    // Resolve voice ID — env vars only, no account lookup
    const voiceIdToUse = voice_id && voice_id !== 'default'
      ? voice_id
      : pickVoiceId(round_type, gender)

    if (!voiceIdToUse) {
      const detail = `No voice configured for round_type="${round_type}" gender="${gender}". Set ELEVENLABS_VOICE_* env vars in Vercel.`
      console.error(`[TTS] ${detail}`)
      return apiError('TTS not configured', 503, { detail })
    }

    // Cache lookup before hitting ElevenLabs. Any storage error (bucket
    // missing, transient failure) falls through to live synthesis — the
    // cache is an optimization, never a dependency.
    const path = cachePath(voiceIdToUse, text)
    const svc = await createServiceClient()
    try {
      const { data: cached } = await svc.storage.from(TTS_CACHE_BUCKET).download(path)
      if (cached) {
        const cachedBuffer = await cached.arrayBuffer()
        if (cachedBuffer.byteLength > 0) {
          return new NextResponse(cachedBuffer, {
            status: 200,
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': cachedBuffer.byteLength.toString(),
              'X-Voice-Id': voiceIdToUse,
              'X-TTS-Cache': 'hit',
            },
          })
        }
      }
    } catch (e) {
      console.warn('[TTS] cache lookup failed (continuing to synthesis):', e instanceof Error ? e.message : e)
    }

    const { response, model: modelUsed } = await generateSpeech(voiceIdToUse, text, apiKey)

    if (!response.ok) {
      const body = await response.text()
      const detail = `ElevenLabs ${response.status} — voice=${voiceIdToUse}: ${body.slice(0, 300)}`
      console.error(`[TTS] Failed: ${detail}`)
      return apiError('TTS generation failed', 502, { detail })
    }

    const audioBuffer = await response.arrayBuffer()

    // Write-through after the response is sent — never delays playback.
    waitUntil(
      svc.storage
        .from(TTS_CACHE_BUCKET)
        .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
        .then(({ error }) => {
          if (error) console.warn('[TTS] cache write failed:', error.message)
        })
        .catch((e) => console.warn('[TTS] cache write failed:', e instanceof Error ? e.message : e))
    )

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Voice-Id': voiceIdToUse,
        'X-TTS-Model': modelUsed,
        'X-TTS-Cache': 'miss',
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[TTS] Unexpected error:', msg, error)
    return apiError('Internal server error', 500, { detail: msg })
  }
}, {
  // A full interview uses ~40-60 TTS calls; 200/hr leaves generous headroom
  // while capping the ElevenLabs spend a single account can generate.
  rateLimit: { prefix: 'tts', max: 200, windowMs: 3_600_000 },
})

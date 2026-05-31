import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundType } from '@/types'

export const dynamic = 'force-dynamic'

// Maps each persona slot to the voice name to search for in ElevenLabs "My Voices"
const VOICE_NAME_MAP: Record<string, { male: string; female: string }> = {
  tech_l1:    { male: 'Aarav J',     female: 'Priya' },
  tech_l2:    { male: 'Akshay',      female: 'Riya Rao' },
  managerial: { male: 'Vikram',      female: 'Shakuntala' },
  hr:         { male: 'Aakash Aryan', female: 'Ayesha' },
  full_loop:  { male: 'Aarav J',     female: 'Priya' },
}

// In-memory cache: apiKey → { voiceName → voiceId }
// Keyed by API key so test/prod accounts stay separate
const voiceCache = new Map<string, Map<string, string>>()

async function fetchVoiceMap(apiKey: string): Promise<Map<string, string>> {
  const cached = voiceCache.get(apiKey)
  if (cached) return cached

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })
  if (!res.ok) {
    console.error(`[TTS] Failed to fetch voices list: ${res.status}`)
    return new Map()
  }

  const data = await res.json() as { voices: Array<{ voice_id: string; name: string }> }
  const map = new Map<string, string>()
  for (const v of data.voices ?? []) {
    map.set(v.name.toLowerCase(), v.voice_id)
  }

  voiceCache.set(apiKey, map)
  console.log(`[TTS] Loaded ${map.size} voices from ElevenLabs account`)
  return map
}

function findVoiceId(nameMap: Map<string, string>, searchName: string): string | undefined {
  const lower = searchName.toLowerCase()
  if (nameMap.has(lower)) return nameMap.get(lower)
  const entries = Array.from(nameMap.entries())
  const startsWith = entries.find(([name]) => name.startsWith(lower))
  if (startsWith) return startsWith[1]
  const partial = entries.find(([name]) => name.includes(lower) || lower.includes(name.split(' ')[0]))
  if (partial) return partial[1]
  return undefined
}

async function resolveVoiceId(
  apiKey: string,
  roundType: string | undefined,
  gender: string | undefined
): Promise<string> {
  // 1. Try env var override first (explicit voice ID takes priority)
  const envMap: Record<string, { male: string | undefined; female: string | undefined }> = {
    tech_l1:    { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
    tech_l2:    { male: process.env.ELEVENLABS_VOICE_TECH_L2,    female: process.env.ELEVENLABS_VOICE_TECH_L2_F },
    managerial: { male: process.env.ELEVENLABS_VOICE_MANAGERIAL, female: process.env.ELEVENLABS_VOICE_MANAGERIAL_F },
    hr:         { male: process.env.ELEVENLABS_VOICE_HR,         female: process.env.ELEVENLABS_VOICE_HR_F },
    full_loop:  { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
  }
  const envEntry = envMap[roundType ?? '']
  if (envEntry) {
    const envId = gender === 'female' ? (envEntry.female ?? envEntry.male) : envEntry.male
    if (envId) {
      console.log(`[TTS] Using env var voice: ${envId} (${roundType}/${gender})`)
      return envId
    }
  }

  // 2. Look up by name from "My Voices"
  const nameEntry = VOICE_NAME_MAP[roundType ?? '']
  if (nameEntry) {
    const searchName = gender === 'female' ? nameEntry.female : nameEntry.male
    const nameMap = await fetchVoiceMap(apiKey)
    const id = findVoiceId(nameMap, searchName)
    if (id) {
      console.log(`[TTS] Found voice by name "${searchName}" → ${id} (${roundType}/${gender})`)
      return id
    }
    console.warn(`[TTS] Voice "${searchName}" not found in My Voices for ${roundType}/${gender}`)
  }

  // 3. Last resort — ElevenLabs pre-made fallback
  console.warn(`[TTS] Using last-resort fallback voice for ${roundType}/${gender}`)
  return 'pNInz6obpgDQGcFmaJgB' // Adam
}

async function callElevenLabs(voiceId: string, text: string, apiKey: string, model = 'eleven_multilingual_v2'): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: model,
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
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { text: rawText, round_type, gender, voice_id } = await request.json() as {
      text: string
      round_type?: RoundType
      gender?: string
      voice_id?: string
    }

    if (!rawText) return NextResponse.json({ error: 'Missing text' }, { status: 400 })

    const text = rawText.slice(0, 500)

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      console.error('[TTS] ELEVENLABS_API_KEY not set')
      return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
    }

    const primaryVoiceId = round_type
      ? await resolveVoiceId(apiKey, round_type, gender)
      : (voice_id && voice_id !== 'default' ? voice_id : 'pNInz6obpgDQGcFmaJgB')

    let response = await callElevenLabs(primaryVoiceId, text, apiKey, 'eleven_multilingual_v2')

    // Model fallback: multilingual_v2 may be unavailable on free tier
    if (!response.ok && response.status !== 401) {
      const errBody = await response.text()
      console.warn(`[TTS] eleven_multilingual_v2 failed (${response.status}), trying eleven_monolingual_v1: ${errBody}`)
      response = await callElevenLabs(primaryVoiceId, text, apiKey, 'eleven_monolingual_v1')
    }

    // If primary voice still fails, try the other gender's voice
    if (!response.ok) {
      const errBody = await response.text()
      console.error(`[TTS] Voice ${primaryVoiceId} failed (${response.status}): ${errBody}`)
      voiceCache.delete(apiKey)

      const fallbackGender = gender === 'female' ? 'male' : 'female'
      const fallbackId = round_type
        ? await resolveVoiceId(apiKey, round_type, fallbackGender)
        : 'pNInz6obpgDQGcFmaJgB'

      if (fallbackId !== primaryVoiceId) {
        console.warn(`[TTS] Retrying with ${fallbackGender} voice: ${fallbackId}`)
        response = await callElevenLabs(fallbackId, text, apiKey, 'eleven_multilingual_v2')
        if (!response.ok) {
          response = await callElevenLabs(fallbackId, text, apiKey, 'eleven_monolingual_v1')
        }
      }
    }

    if (!response.ok) {
      const detail = await response.text()
      console.error(`[TTS] All voices/models failed: ${detail}`)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
    }

    const audioBuffer = await response.arrayBuffer()
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'X-Voice-Id': primaryVoiceId,
      },
    })
  } catch (error) {
    console.error('[TTS] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

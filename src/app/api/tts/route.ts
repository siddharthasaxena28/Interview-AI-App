import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundType } from '@/types'

export const dynamic = 'force-dynamic'

// Voice names to look up in the account's "My Voices"
const VOICE_NAME_MAP: Record<string, { male: string; female: string }> = {
  tech_l1:    { male: 'Aarav J',      female: 'Priya' },
  tech_l2:    { male: 'Akshay',       female: 'Riya Rao' },
  managerial: { male: 'Vikram',       female: 'Shakuntala' },
  hr:         { male: 'Aakash Aryan', female: 'Ayesha' },
  full_loop:  { male: 'Aarav J',      female: 'Priya' },
}

// env var overrides per round+gender (explicit voice IDs that skip name lookup)
const ENV_VOICE_MAP: Record<string, { male: string | undefined; female: string | undefined }> = {
  tech_l1:    { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
  tech_l2:    { male: process.env.ELEVENLABS_VOICE_TECH_L2,    female: process.env.ELEVENLABS_VOICE_TECH_L2_F },
  managerial: { male: process.env.ELEVENLABS_VOICE_MANAGERIAL, female: process.env.ELEVENLABS_VOICE_MANAGERIAL_F },
  hr:         { male: process.env.ELEVENLABS_VOICE_HR,         female: process.env.ELEVENLABS_VOICE_HR_F },
  full_loop:  { male: process.env.ELEVENLABS_VOICE_TECH_L1,    female: process.env.ELEVENLABS_VOICE_TECH_L1_F },
}

interface AccountVoices {
  nameToId: Map<string, string> // name.toLowerCase() → voice_id
  idSet: Set<string>             // all voice_ids present in this account
  anyId: string | null           // first voice in account (catch-all fallback)
}

// Cache keyed by API key so different accounts (test vs prod) don't collide
const voiceCache = new Map<string, AccountVoices>()

async function fetchAccountVoices(apiKey: string): Promise<AccountVoices> {
  const cached = voiceCache.get(apiKey)
  if (cached) return cached

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    console.error(`[TTS] /v1/voices failed: ${res.status} — API key may be invalid`)
    return { nameToId: new Map(), idSet: new Set(), anyId: null }
  }

  const data = await res.json() as { voices: Array<{ voice_id: string; name: string }> }
  const nameToId = new Map<string, string>()
  const idSet = new Set<string>()
  let anyId: string | null = null

  for (const v of data.voices ?? []) {
    nameToId.set(v.name.toLowerCase(), v.voice_id)
    idSet.add(v.voice_id)
    if (!anyId) anyId = v.voice_id
  }

  voiceCache.set(apiKey, { nameToId, idSet, anyId })
  console.log(`[TTS] Loaded ${nameToId.size} voices from account. Names: ${Array.from(nameToId.keys()).join(', ')}`)
  return { nameToId, idSet, anyId }
}

function findVoiceByName(nameToId: Map<string, string>, searchName: string): string | undefined {
  const lower = searchName.toLowerCase()
  // 1. Exact match
  if (nameToId.has(lower)) return nameToId.get(lower)
  const entries = Array.from(nameToId.entries())
  // 2. Account voice name starts with our search name (e.g. "vikram s" matches "vikram")
  const startsWith = entries.find(([n]) => n.startsWith(lower) || lower.startsWith(n))
  if (startsWith) return startsWith[1]
  // 3. First word match (e.g. "aarav" matches "aarav j")
  const firstWord = lower.split(' ')[0]
  const partial = entries.find(([n]) => n.startsWith(firstWord) || n.includes(firstWord))
  if (partial) return partial[1]
  return undefined
}

async function pickVoiceId(
  apiKey: string,
  roundType: string | undefined,
  gender: string | undefined,
): Promise<string> {
  const account = await fetchAccountVoices(apiKey)

  // 1. Env var override — validate it actually belongs to THIS account
  const envEntry = ENV_VOICE_MAP[roundType ?? '']
  if (envEntry) {
    const envId = gender === 'female' ? (envEntry.female ?? envEntry.male) : envEntry.male
    if (envId) {
      if (account.idSet.has(envId)) {
        console.log(`[TTS] env-var voice ${envId} found in account ✓ (${roundType}/${gender})`)
        return envId
      }
      console.warn(`[TTS] env-var voice ${envId} NOT in this account — skipping (old account's ID?)`)
    }
  }

  // 2. Name-based lookup — look for the configured voice name
  const nameEntry = VOICE_NAME_MAP[roundType ?? '']
  if (nameEntry) {
    const wantedName = gender === 'female' ? nameEntry.female : nameEntry.male
    const id = findVoiceByName(account.nameToId, wantedName)
    if (id) {
      console.log(`[TTS] Found "${wantedName}" → ${id} (${roundType}/${gender})`)
      return id
    }
    // Try the other gender's voice for this round
    const otherName = gender === 'female' ? nameEntry.male : nameEntry.female
    const otherId = findVoiceByName(account.nameToId, otherName)
    if (otherId) {
      console.log(`[TTS] "${wantedName}" not found, using "${otherName}" → ${otherId}`)
      return otherId
    }
    console.warn(`[TTS] Neither "${wantedName}" nor "${otherName}" found in account`)
  }

  // 3. Use any voice available in the account
  if (account.anyId) {
    console.warn(`[TTS] No named voice matched — using first account voice ${account.anyId}`)
    return account.anyId
  }

  // 4. Last resort: ElevenLabs pre-made Adam voice
  console.warn('[TTS] No voices in account — trying Adam pre-made voice')
  return 'pNInz6obpgDQGcFmaJgB'
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

async function generateSpeech(voiceId: string, text: string, apiKey: string): Promise<Response> {
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
      return res
    }

    // 401 = bad API key, 404 = voice not found — no point trying more models
    if (res.status === 401 || res.status === 404) {
      const body = await res.text()
      console.error(`[TTS] ${res.status} on model=${model} voice=${voiceId}: ${body.slice(0, 200)}`)
      return res
    }

    const body = await res.text()
    console.warn(`[TTS] ${res.status} on model=${model}: ${body.slice(0, 150)} — trying next model`)
  }

  // All models exhausted — return the last failure
  return await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODELS[0] }),
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
    const text = rawText.slice(0, 2000)

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      console.error('[TTS] ELEVENLABS_API_KEY is not set in environment variables')
      return NextResponse.json({ error: 'TTS not configured', detail: 'ELEVENLABS_API_KEY missing' }, { status: 503 })
    }

    // Resolve voice ID — validates env vars against account, falls back through names → any voice → Adam
    const voiceIdToUse = round_type
      ? await pickVoiceId(apiKey, round_type, gender)
      : (voice_id && voice_id !== 'default' ? voice_id : await pickVoiceId(apiKey, undefined, gender))

    const response = await generateSpeech(voiceIdToUse, text, apiKey)

    if (!response.ok) {
      const body = await response.text()
      const detail = response.status === 401
        ? 'ELEVENLABS_API_KEY is invalid — update it in Vercel → Settings → Environment Variables'
        : response.status === 404
        ? `Voice ${voiceIdToUse} not found — check your ElevenLabs My Voices`
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
      },
    })
  } catch (error) {
    console.error('[TTS] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

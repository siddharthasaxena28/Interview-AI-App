import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MODELS_TO_TEST = [
  'eleven_flash_v2_5',
  'eleven_turbo_v2_5',
  'eleven_multilingual_v2',
  'eleven_monolingual_v1',
]

export async function GET(request: NextRequest) {
  const secret = process.env.DEV_TOOLS_SECRET
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not set' }, { status: 503 })

  // 1. Fetch all voices from the account
  const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })

  if (!voicesRes.ok) {
    const body = await voicesRes.text()
    return NextResponse.json({
      error: `ElevenLabs /v1/voices returned ${voicesRes.status}`,
      detail: body,
      hint: voicesRes.status === 401
        ? 'ELEVENLABS_API_KEY is invalid or not updated in Vercel — check Settings → Environment Variables'
        : undefined,
    }, { status: 502 })
  }

  const data = await voicesRes.json() as { voices: Array<{ voice_id: string; name: string }> }
  const voices = data.voices.map(v => ({ id: v.voice_id, name: v.name }))

  // 2. Test which TTS models are available with the first voice in the account
  const testVoiceId = voices[0]?.id ?? 'pNInz6obpgDQGcFmaJgB'
  const testText = 'Test.'
  const modelResults: Record<string, string> = {}

  for (const model of MODELS_TO_TEST) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${testVoiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: testText, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    })
    if (res.ok) {
      modelResults[model] = 'available'
    } else {
      const err = await res.text()
      modelResults[model] = `${res.status}: ${err.slice(0, 120)}`
    }
  }

  // 3. Show env vars vs what's in the account
  const envVoiceIds = {
    ELEVENLABS_VOICE_TECH_L1:      process.env.ELEVENLABS_VOICE_TECH_L1      ?? '(not set)',
    ELEVENLABS_VOICE_TECH_L1_F:    process.env.ELEVENLABS_VOICE_TECH_L1_F    ?? '(not set)',
    ELEVENLABS_VOICE_TECH_L2:      process.env.ELEVENLABS_VOICE_TECH_L2      ?? '(not set)',
    ELEVENLABS_VOICE_TECH_L2_F:    process.env.ELEVENLABS_VOICE_TECH_L2_F    ?? '(not set)',
    ELEVENLABS_VOICE_MANAGERIAL:   process.env.ELEVENLABS_VOICE_MANAGERIAL   ?? '(not set)',
    ELEVENLABS_VOICE_MANAGERIAL_F: process.env.ELEVENLABS_VOICE_MANAGERIAL_F ?? '(not set)',
    ELEVENLABS_VOICE_HR:           process.env.ELEVENLABS_VOICE_HR            ?? '(not set)',
    ELEVENLABS_VOICE_HR_F:         process.env.ELEVENLABS_VOICE_HR_F          ?? '(not set)',
  }

  // Check if each env var ID actually exists in this account's voices
  const accountVoiceIds = new Set(voices.map(v => v.id))
  const envVoiceCheck: Record<string, string> = {}
  for (const [k, v] of Object.entries(envVoiceIds)) {
    if (v === '(not set)') { envVoiceCheck[k] = 'not set' }
    else if (accountVoiceIds.has(v)) { envVoiceCheck[k] = `✓ found in account (${v})` }
    else { envVoiceCheck[k] = `✗ NOT in this account's My Voices (${v}) — add it or clear this var` }
  }

  return NextResponse.json({
    api_key_prefix: apiKey.slice(0, 8) + '...',
    total_voices_in_account: voices.length,
    voices,
    model_availability: modelResults,
    env_voice_ids: envVoiceCheck,
    recommendation: Object.values(modelResults).includes('available')
      ? `Use model: ${MODELS_TO_TEST.find(m => modelResults[m] === 'available')}`
      : 'No TTS model is available — check account plan or API key',
  })
}

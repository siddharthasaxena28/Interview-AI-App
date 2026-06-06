import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.DEV_TOOLS_SECRET
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    return NextResponse.json({
      status: 'error',
      problem: 'ELEVENLABS_API_KEY is not set in Vercel environment variables',
      fix: 'Vercel → your project → Settings → Environment Variables → add ELEVENLABS_API_KEY',
    })
  }

  // Step 1: Validate API key by fetching voice list
  const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })

  if (!voicesRes.ok) {
    const body = await voicesRes.text()
    return NextResponse.json({
      status: 'error',
      api_key_prefix: apiKey.slice(0, 8) + '...',
      problem: voicesRes.status === 401
        ? 'API key rejected (401) — key is invalid or from a different account'
        : `ElevenLabs returned ${voicesRes.status}`,
      raw_error: body.slice(0, 300),
      fix: 'Go to elevenlabs.io → sign in → Profile (top-right) → API Keys → copy key → update ELEVENLABS_API_KEY in Vercel',
    })
  }

  const voiceData = await voicesRes.json() as { voices: Array<{ voice_id: string; name: string }> }
  const voices = voiceData.voices ?? []
  const accountIdSet = new Set(voices.map(v => v.voice_id))

  // Step 2: Test audio generation — try each model with first account voice
  const testVoiceId = voices[0]?.voice_id ?? 'pNInz6obpgDQGcFmaJgB'
  const modelResults: Record<string, string> = {}
  let firstWorkingModel: string | null = null

  for (const model of ['eleven_flash_v2_5', 'eleven_flash_v2', 'eleven_turbo_v2_5', 'eleven_multilingual_v2']) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${testVoiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: 'Test.', model_id: model }),
    })
    if (r.ok) {
      modelResults[model] = '✓ available'
      if (!firstWorkingModel) firstWorkingModel = model
    } else {
      const err = await r.text()
      modelResults[model] = `✗ HTTP ${r.status}: ${err.slice(0, 80)}`
    }
  }

  // Step 3: Check env var voice IDs against this account
  const envVarNames = [
    'ELEVENLABS_VOICE_TECH_L1', 'ELEVENLABS_VOICE_TECH_L1_F',
    'ELEVENLABS_VOICE_TECH_L2', 'ELEVENLABS_VOICE_TECH_L2_F',
    'ELEVENLABS_VOICE_MANAGERIAL', 'ELEVENLABS_VOICE_MANAGERIAL_F',
    'ELEVENLABS_VOICE_HR', 'ELEVENLABS_VOICE_HR_F',
  ]
  const envVarCheck: Record<string, string> = {}
  let wrongAccountIds = 0
  for (const name of envVarNames) {
    const val = process.env[name]
    if (!val) {
      envVarCheck[name] = '(not set) — name-based lookup will be used'
    } else if (accountIdSet.has(val)) {
      envVarCheck[name] = `✓ valid for this account (${val})`
    } else {
      envVarCheck[name] = `✗ WRONG ACCOUNT — ${val} is not in this account's My Voices`
      wrongAccountIds++
    }
  }

  return NextResponse.json({
    status: firstWorkingModel ? 'ok' : 'error',
    api_key_prefix: apiKey.slice(0, 8) + '...',
    account_voice_count: voices.length,
    account_voices: voices.map(v => ({ id: v.voice_id, name: v.name })),
    model_test: modelResults,
    env_var_voice_ids: envVarCheck,
    diagnosis: wrongAccountIds > 0
      ? `${wrongAccountIds} env var voice IDs belong to a different ElevenLabs account. Clear them in Vercel — the app will auto-find voices by name instead.`
      : voices.length === 0
      ? 'API key is valid but this account has no voices in My Voices. Add voices at elevenlabs.io/voice-library'
      : firstWorkingModel
      ? `Everything looks good. Using model: ${firstWorkingModel}`
      : 'API key valid, voices found, but no TTS model worked. Check your account plan.',
  })
}

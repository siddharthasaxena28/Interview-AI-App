import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// No auth — developer diagnostic endpoint.
// Visit /api/test-tts to verify ElevenLabs connectivity without running an interview.
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      status: 'error',
      problem: 'ELEVENLABS_API_KEY is not set',
      fix: 'Go to Vercel → your project → Settings → Environment Variables → add ELEVENLABS_API_KEY with your ElevenLabs API key',
    })
  }

  const results: Record<string, string> = {}

  // Step 1: Verify API key by listing voices
  const voicesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })
  if (!voicesRes.ok) {
    const body = await voicesRes.text()
    return NextResponse.json({
      status: 'error',
      api_key_prefix: apiKey.slice(0, 8) + '...',
      problem: voicesRes.status === 401
        ? 'API key is invalid (401 Unauthorized)'
        : `Failed to fetch voices: HTTP ${voicesRes.status}`,
      raw_error: body.slice(0, 300),
      fix: voicesRes.status === 401
        ? 'Copy your API key from elevenlabs.io → Profile → API Keys and update ELEVENLABS_API_KEY in Vercel'
        : 'Unexpected error from ElevenLabs — check account status',
    })
  }

  const voiceData = await voicesRes.json() as { voices: Array<{ voice_id: string; name: string }> }
  const voices = voiceData.voices ?? []

  // Step 2: Test audio generation with flash model (works on all plans)
  const testVoiceId = voices[0]?.voice_id ?? 'pNInz6obpgDQGcFmaJgB'
  const testText = 'Hello, this is a connectivity test.'

  for (const model of ['eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_multilingual_v2']) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${testVoiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: testText, model_id: model }),
    })
    results[model] = r.ok ? 'available ✓' : `HTTP ${r.status}`
  }

  // Step 3: Check which configured env var voice IDs exist in this account
  const accountIds = new Set(voices.map((v: { voice_id: string }) => v.voice_id))
  const envCheck: Record<string, string> = {}
  const envVarNames = [
    'ELEVENLABS_VOICE_TECH_L1', 'ELEVENLABS_VOICE_TECH_L1_F',
    'ELEVENLABS_VOICE_TECH_L2', 'ELEVENLABS_VOICE_TECH_L2_F',
    'ELEVENLABS_VOICE_MANAGERIAL', 'ELEVENLABS_VOICE_MANAGERIAL_F',
    'ELEVENLABS_VOICE_HR', 'ELEVENLABS_VOICE_HR_F',
  ]
  for (const name of envVarNames) {
    const val = process.env[name]
    if (!val) {
      envCheck[name] = '(not set — will use name-based lookup)'
    } else if (accountIds.has(val)) {
      envCheck[name] = `✓ found in account (${val})`
    } else {
      envCheck[name] = `✗ NOT in this account — voice ID ${val} belongs to a different ElevenLabs account. Clear this env var in Vercel so name-based lookup is used instead.`
    }
  }

  const firstWorkingModel = Object.entries(results).find(([, v]) => v.startsWith('available'))
  const hasWorkingModel = !!firstWorkingModel

  return NextResponse.json({
    status: hasWorkingModel ? 'ok' : 'error',
    api_key_prefix: apiKey.slice(0, 8) + '...',
    account_voices: voices.map((v: { voice_id: string; name: string }) => ({ id: v.voice_id, name: v.name })),
    model_test_results: results,
    env_var_voice_ids: envCheck,
    recommendation: hasWorkingModel
      ? `ElevenLabs is working. First available model: ${firstWorkingModel![0]}`
      : 'No TTS model worked. Check your account plan at elevenlabs.io',
    next_steps: Object.values(envCheck).some(v => v.includes('NOT in this account'))
      ? 'Some env var voice IDs are from a different account. Either clear those env vars in Vercel (recommended — name-based lookup will then work automatically), or update them with IDs from this account.'
      : undefined,
  })
}

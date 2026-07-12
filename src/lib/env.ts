// Boot-time environment validation, called from instrumentation.ts.
//
// Without this, a missing variable surfaces as an opaque request-time
// failure deep inside whichever route touches it first (e.g. a 500 from
// /api/tts because ELEVENLABS_API_KEY was never set on the new host).
// Validating once at boot turns that into a single unmissable message
// that names every missing variable.
//
// Deliberately dependency-free — presence checks don't need a schema
// library.

/** The app is non-functional without these. */
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY', // read implicitly by new Anthropic()
  'DEEPGRAM_API_KEY',
  'ELEVENLABS_API_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
] as const

/** Features degrade without these, but the app still runs. */
const RECOMMENDED = [
  'NEXT_PUBLIC_APP_URL',
  'UPSTASH_REDIS_REST_URL', // rate limiting falls back to per-instance memory
  'UPSTASH_REDIS_REST_TOKEN',
  'RESEND_API_KEY', // transactional email silently skipped
  'CRON_SECRET', // cron nudges rejected
  'ELEVENLABS_VOICE_TECH_L1', // TTS falls back to browser speech synthesis
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY', // push notifications disabled
  'VAPID_PRIVATE_KEY',
] as const

export function validateEnv(): void {
  const missing = REQUIRED.filter((k) => !process.env[k])
  const degraded = RECOMMENDED.filter((k) => !process.env[k])

  if (degraded.length > 0) {
    console.warn(
      `[env] Optional variables not set (features degraded): ${degraded.join(', ')}`
    )
  }

  if (missing.length > 0) {
    const msg = `[env] Missing required environment variables: ${missing.join(', ')}`
    // `next build` also sets NODE_ENV=production and (with instrumentationHook
    // enabled) runs this during page-data collection — throwing there crashes
    // the build itself with an opaque "Failed to collect page data" error
    // instead of a real deploy-time signal. Only hard-fail at actual server
    // startup, which Next.js marks with NEXT_PHASE=phase-production-server.
    const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
    if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
      // Fail loudly at boot rather than 500ing on the first request that
      // happens to need the variable.
      throw new Error(msg)
    }
    console.warn(`${msg} — continuing (build phase or non-production)`)
  }
}

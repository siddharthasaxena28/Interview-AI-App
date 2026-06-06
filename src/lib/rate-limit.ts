// Sliding-window rate limiter.
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are set (correct across Vercel serverless instances). Falls back to an
// in-process map when those vars are absent (local dev / preview deploys).

let _upstash: {
  ratelimit: (key: string, max: number, windowMs: number) => Promise<boolean>
} | null = null

function getUpstash() {
  if (_upstash !== null) return _upstash
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  // Lazy import so the in-process path never loads these modules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require('@upstash/redis')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Ratelimit } = require('@upstash/ratelimit')

  const redis = new Redis({ url, token })

  _upstash = {
    ratelimit: async (key: string, max: number, windowMs: number) => {
      const limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(max, `${windowMs}ms`),
        prefix: 'rl',
      })
      const { success } = await limiter.limit(key)
      return success
    },
  }
  return _upstash
}

// In-process fallback (single-instance only).
const store = new Map<string, number[]>()

function inProcessCheck(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs)
  if (timestamps.length >= maxRequests) return false
  timestamps.push(now)
  store.set(key, timestamps)
  return true
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  const upstash = getUpstash()
  if (upstash) {
    try {
      return await upstash.ratelimit(key, maxRequests, windowMs)
    } catch {
      // Redis unavailable — fall through to in-process
    }
  }
  return inProcessCheck(key, maxRequests, windowMs)
}

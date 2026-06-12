// Sliding-window rate limiter.
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are set (correct across Vercel serverless instances). Falls back to an
// in-process map when those vars are absent (local dev / preview deploys).

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// One limiter per (max, window) config. A single shared instance would lock
// every route to whichever config happened to construct it first.
const _limiters = new Map<string, Ratelimit>()
let _redis: Redis | null = null

function getLimiter(max: number, windowMs: number): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const cfgKey = `${max}:${windowMs}`
  let limiter = _limiters.get(cfgKey)
  if (!limiter) {
    _redis ??= new Redis({ url, token })
    limiter = new Ratelimit({
      redis: _redis,
      limiter: Ratelimit.slidingWindow(max, `${windowMs}ms`),
      prefix: 'rl',
    })
    _limiters.set(cfgKey, limiter)
  }
  return limiter
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
  const limiter = getLimiter(maxRequests, windowMs)
  if (limiter) {
    try {
      const { success } = await limiter.limit(key)
      return success
    } catch {
      // Redis unavailable — fall through to in-process
    }
  }
  return inProcessCheck(key, maxRequests, windowMs)
}

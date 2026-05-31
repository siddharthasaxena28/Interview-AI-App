// Lightweight in-process sliding-window rate limiter.
// Per-process state is acceptable for a serverless deployment — each instance
// independently enforces its own window, which is intentionally conservative
// rather than perfectly coordinated. Replace with Upstash Redis for stricter
// cross-instance enforcement if needed.

const store = new Map<string, number[]>()

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now()
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs)
  if (timestamps.length >= maxRequests) return false
  timestamps.push(now)
  store.set(key, timestamps)
  return true
}

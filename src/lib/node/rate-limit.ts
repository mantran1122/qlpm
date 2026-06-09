import { LRUCache } from 'lru-cache'

// In-memory LRU cho single-instance deploy.
// Swap sang Redis (Upstash) bằng cách thay hàm rateLimit.
interface RateLimitEntry {
  count: number
  resetAt: number  // epoch ms
}

const cache = new LRUCache<string, RateLimitEntry>({
  max: 10_000,
  ttl: 60 * 60 * 1000,  // 1 giờ TTL tối đa
})

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export function rateLimit(
  key: string,
  max: number,
  windowSec: number
): RateLimitResult {
  const now = Date.now()
  const windowMs = windowSec * 1000
  const entry = cache.get(key)

  if (!entry || now > entry.resetAt) {
    cache.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: max - 1, retryAfterSeconds: 0 }
  }

  if (entry.count >= max) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { ok: false, remaining: 0, retryAfterSeconds }
  }

  entry.count += 1
  cache.set(key, entry)
  return { ok: true, remaining: max - entry.count, retryAfterSeconds: 0 }
}

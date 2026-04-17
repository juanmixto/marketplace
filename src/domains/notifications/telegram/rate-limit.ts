const WINDOW_MS = 5 * 60 * 1000
const MAX_PER_WINDOW = 30

const buckets = new Map<string, number[]>()

export function checkRateLimit(userId: string, now: number = Date.now()): boolean {
  const cutoff = now - WINDOW_MS
  const timestamps = buckets.get(userId) ?? []
  const recent = timestamps.filter(t => t >= cutoff)

  if (recent.length >= MAX_PER_WINDOW) {
    buckets.set(userId, recent)
    return false
  }
  recent.push(now)
  buckets.set(userId, recent)
  return true
}

export function resetRateLimitForTest(userId?: string): void {
  if (userId) buckets.delete(userId)
  else buckets.clear()
}

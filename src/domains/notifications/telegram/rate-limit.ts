const OUTBOUND_WINDOW_MS = 5 * 60 * 1000
const OUTBOUND_MAX_PER_WINDOW = 30

const INBOUND_WINDOW_MS = 60 * 1000
const INBOUND_MAX_PER_WINDOW = 60

const outboundBuckets = new Map<string, number[]>()
const inboundBuckets = new Map<string, number[]>()

function allow(
  buckets: Map<string, number[]>,
  key: string,
  windowMs: number,
  max: number,
  now: number,
): boolean {
  const cutoff = now - windowMs
  const timestamps = buckets.get(key) ?? []
  const recent = timestamps.filter(t => t >= cutoff)
  if (recent.length >= max) {
    buckets.set(key, recent)
    return false
  }
  recent.push(now)
  buckets.set(key, recent)
  return true
}

export function checkRateLimit(userId: string, now: number = Date.now()): boolean {
  return allow(outboundBuckets, userId, OUTBOUND_WINDOW_MS, OUTBOUND_MAX_PER_WINDOW, now)
}

export function checkInboundRateLimit(ip: string, now: number = Date.now()): boolean {
  return allow(inboundBuckets, ip, INBOUND_WINDOW_MS, INBOUND_MAX_PER_WINDOW, now)
}

export function resetRateLimitForTest(userId?: string): void {
  if (userId) outboundBuckets.delete(userId)
  else outboundBuckets.clear()
}

export function resetInboundRateLimitForTest(ip?: string): void {
  if (ip) inboundBuckets.delete(ip)
  else inboundBuckets.clear()
}

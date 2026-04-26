/**
 * Module-scoped in-memory store for the mock OAuth flow. Maps the
 * authorization `code` (which doubles as access_token) to the user
 * info captured at /api/__test__/oauth/authorize. Only loaded when
 * `MOCK_OAUTH_ENABLED=1` (the route handlers are 404 otherwise).
 *
 * Storage is per-process; in dev (`next dev`) the same module instance
 * services authorize → token → userinfo. Single-process Playwright
 * runs hit the same store. TTL keeps the map bounded.
 */

interface Entry {
  email: string
  name: string
  sub: string
  exp: number
}

const TTL_MS = 60_000
const store = new Map<string, Entry>()

export function putMockEntry(code: string, value: Omit<Entry, 'exp'>): void {
  store.set(code, { ...value, exp: Date.now() + TTL_MS })
}

export function getMockEntry(code: string): Omit<Entry, 'exp'> | null {
  const entry = store.get(code)
  if (!entry) return null
  if (entry.exp < Date.now()) {
    store.delete(code)
    return null
  }
  // Strip exp before returning to callers.
  const { exp: _exp, ...rest } = entry
  return rest
}

export function clearMockStore(): void {
  store.clear()
}

export function generateMockCode(): string {
  // 16 hex bytes is plenty for non-collision in test runs.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

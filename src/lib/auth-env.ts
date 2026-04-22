/**
 * Issue #591: deployment-topology helpers for NextAuth.
 *
 * The production topology is:
 *
 *   browser  ──HTTPS──▶  Cloudflare  ──HTTP──▶  Next.js origin
 *
 * Cloudflare terminates TLS and forwards requests to the origin as
 * plain HTTP. That matters for NextAuth cookie naming:
 *
 *   - The NextAuth callback sets the cookie with `secure: true` and
 *     the `__Secure-` prefix whenever the URL it sees is HTTPS (i.e.
 *     whenever AUTH_URL starts with `https://`).
 *   - The edge `getToken()` call auto-detects the cookie name from
 *     the request URL's protocol. Behind Cloudflare the origin sees
 *     `http://...`, so auto-detect picks the non-prefixed name and
 *     fails to find the cookie.
 *
 * `isSecureAuthDeployment()` resolves the contract by looking at
 * AUTH_URL / NEXTAUTH_URL (the canonical public URL), not the
 * request protocol. Callers of `getToken()` should pass
 * `secureCookie` explicitly based on that value.
 *
 * Kept dependency-free so it runs in the Edge runtime AND can be
 * imported by the contract test without pulling the Prisma client.
 */

function isPrivateNetworkHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  )
}

function toAbsoluteUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

function resolveVercelUrl(env: Partial<NodeJS.ProcessEnv>): string | null {
  const productionUrl = toAbsoluteUrl(env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL)
  const runtimeUrl = toAbsoluteUrl(env.VERCEL_URL)

  if (env.VERCEL_ENV === 'production') {
    return productionUrl ?? runtimeUrl
  }

  return runtimeUrl ?? productionUrl
}

export function resolvePublicAppUrl(env: Partial<NodeJS.ProcessEnv>): string | null {
  const explicitUrl = toAbsoluteUrl(env.NEXT_PUBLIC_APP_URL)
  const vercelUrl = resolveVercelUrl(env)

  if (env.VERCEL === '1' || typeof env.VERCEL_ENV === 'string') {
    if (vercelUrl) return vercelUrl
    if (explicitUrl) {
      try {
        if (isPrivateNetworkHost(new URL(explicitUrl).hostname)) return null
      } catch {
        return null
      }
      return explicitUrl
    }
    return null
  }

  return explicitUrl ?? vercelUrl
}

export function resolveAuthUrl(env: Partial<NodeJS.ProcessEnv>): string | null {
  // Fall through on undefined AND empty string — a deployment that
  // sets AUTH_URL="" should be treated as unset so NEXTAUTH_URL can
  // cover it, not as a pin to an empty origin.
  const explicitCandidates = [env.AUTH_URL, env.NEXTAUTH_URL]
  for (const value of explicitCandidates) {
    const url = toAbsoluteUrl(value)
    if (url) return url
  }

  if (env.VERCEL === '1' || typeof env.VERCEL_ENV === 'string') {
    return resolvePublicAppUrl(env)
  }

  return null
}

export function isSecureAuthDeployment(env: Partial<NodeJS.ProcessEnv>): boolean {
  const url = resolveAuthUrl(env)
  if (!url) return false
  return url.startsWith('https://')
}

/**
 * Validates that every public-facing auth URL env var agrees. Returns
 * an array of human-readable mismatch messages, or `[]` when the
 * deployment is consistent. A non-empty result should fail startup
 * in production — a split-brain between AUTH_URL and
 * NEXT_PUBLIC_APP_URL is a common root cause of auth redirects that
 * land on the wrong origin and drop the session cookie.
 */
export function validateAuthDeploymentContract(env: Partial<NodeJS.ProcessEnv>): string[] {
  const errors: string[] = []
  const authUrl = resolveAuthUrl(env)
  const appUrl = resolvePublicAppUrl(env)

  if (env.NODE_ENV !== 'production') return errors

  if (!authUrl) {
    errors.push('A public app URL must be available in production so NextAuth emits the correct cookie prefix and callback URLs.')
    return errors
  }

  if (!authUrl.startsWith('https://')) {
    errors.push(`AUTH_URL must use https:// in production (got ${authUrl}). The Cloudflare → origin leg is HTTP, but the public URL must stay HTTPS so the __Secure- cookie prefix is used.`)
  }

  if (appUrl && appUrl !== authUrl) {
    try {
      const a = new URL(authUrl)
      const b = new URL(appUrl)
      if (a.origin !== b.origin) {
        errors.push(`AUTH_URL (${a.origin}) and NEXT_PUBLIC_APP_URL (${b.origin}) must resolve to the same origin. A mismatch causes session cookies to be scoped to a host the app never redirects to.`)
      }
    } catch {
      errors.push(`AUTH_URL or NEXT_PUBLIC_APP_URL is not a valid URL. AUTH_URL=${authUrl}, NEXT_PUBLIC_APP_URL=${appUrl}`)
    }
  }

  if (!env.AUTH_SECRET && !env.NEXTAUTH_SECRET) {
    errors.push('AUTH_SECRET (or NEXTAUTH_SECRET) must be set in production.')
  }

  return errors
}

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

export function resolveAuthUrl(env: NodeJS.ProcessEnv): string | null {
  // Fall through on undefined AND empty string — a deployment that
  // sets AUTH_URL="" should be treated as unset so NEXTAUTH_URL can
  // cover it, not as a pin to an empty origin.
  const candidates = [env.AUTH_URL, env.NEXTAUTH_URL]
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

export function isSecureAuthDeployment(env: NodeJS.ProcessEnv): boolean {
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
export function validateAuthDeploymentContract(env: NodeJS.ProcessEnv): string[] {
  const errors: string[] = []
  const authUrl = env.AUTH_URL ?? env.NEXTAUTH_URL
  const appUrl = env.NEXT_PUBLIC_APP_URL

  if (env.NODE_ENV !== 'production') return errors

  if (!authUrl) {
    errors.push('AUTH_URL (or NEXTAUTH_URL) must be set in production so NextAuth emits the correct cookie prefix and callback URLs.')
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

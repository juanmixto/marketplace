/**
 * Admin host isolation (ticket #348).
 *
 * When the `ADMIN_HOST` environment variable is set (e.g.
 * `admin.marketplace.example`), the `/admin/**` routes are only reachable
 * on that host, and the admin host rejects every non-admin route with a
 * 404. This is enforced in `src/proxy.ts` (edge middleware), so no admin
 * page is ever rendered on the public host — not even for logged-in
 * admins who typed the URL manually.
 *
 * The helpers in this file are edge-safe: they rely only on Request /
 * string primitives and MUST NOT import Prisma, logger, or any Node API.
 *
 * Infrastructure setup (not automated, owner action required):
 *   1. Point `admin.<your-domain>` at the same deployment.
 *   2. Set `ADMIN_HOST=admin.<your-domain>` in the environment.
 *   3. Ensure TLS is terminated for the subdomain.
 *   4. See `docs/admin-host.md` for the full runbook.
 *
 * Cookie scoping: the NextAuth session cookie today is host-only (no
 * explicit Domain attribute in `src/lib/auth-host.ts`), which means a
 * sibling-domain `admin.<dom>` gets its OWN session cookie, isolated from
 * the public host. This ticket takes advantage of that to achieve cookie
 * isolation without any code change to the auth layer — but it is a
 * standing invariant. If a future change adds `Domain=<parent>` to the
 * session cookie, this isolation is silently defeated. The test
 * `admin-host.test.ts` pins the expectation.
 */

export const ADMIN_HOST_ENV_VAR = 'ADMIN_HOST'

/**
 * Returns true when the given host header value matches the configured
 * `ADMIN_HOST`. Case-insensitive and ignores the `:port` suffix so dev
 * (`admin.localhost:3000`) and prod (`admin.example.com`) both work.
 */
export function hostMatchesAdmin(host: string | null | undefined, adminHost: string | undefined): boolean {
  if (!host || !adminHost) return false
  const normalizedHost = host.toLowerCase().split(':')[0]!
  const normalizedAdmin = adminHost.toLowerCase().split(':')[0]!
  return normalizedHost === normalizedAdmin
}

/**
 * Reads the host from an incoming `NextRequest`-like object and compares
 * it against the `ADMIN_HOST` env var. Accepts a minimal structural type
 * so this function can be unit-tested without constructing a full
 * `NextRequest`.
 */
export function isRequestOnAdminHost(request: { headers: { get(name: string): string | null } }): boolean {
  const adminHost = process.env[ADMIN_HOST_ENV_VAR]
  if (!adminHost) return false
  const host = request.headers.get('host') ?? request.headers.get('x-forwarded-host')
  return hostMatchesAdmin(host, adminHost)
}

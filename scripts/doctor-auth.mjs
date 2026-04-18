/**
 * Programmatic NextAuth v5 session-cookie builder for #526.
 *
 * Why: the `doctor` probes can only return 307 on protected routes
 * without a session cookie, so a 500 that only fires AFTER the
 * middleware check (e.g. a bad Prisma query in the vendor dashboard's
 * server component) is invisible. This helper produces a valid
 * session cookie so `doctor` can probe protected routes as a real
 * user and assert 200.
 *
 * Strategy: use NextAuth's own `encode` helper from `@auth/core/jwt`
 * (re-exported by `next-auth/jwt`). The cookie value matches exactly
 * what NextAuth produces on a real login — no reverse-engineering of
 * the internal encoding format. If NextAuth changes the format in a
 * future release, this file breaks at build time (type error) rather
 * than silently in production (wrong format, auth fails but probe
 * interprets the 307 as healthy).
 */

import { encode } from 'next-auth/jwt'

// NextAuth v5 cookie name. Prefixed `__Secure-` when served over HTTPS
// (production). Plain on http://localhost.
function sessionCookieName(baseUrl) {
  return baseUrl.startsWith('https://')
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'
}

/**
 * Build a cookie header that NextAuth will accept as a logged-in
 * session. `userId` and `role` match what the app's auth-config.ts
 * places on the JWT in its `jwt` callback.
 *
 * The resulting token is signed + encrypted with AUTH_SECRET exactly
 * like a real login would produce.
 */
export async function buildSessionCookie({
  baseUrl,
  userId,
  role,
  email,
  name,
  secret = process.env.AUTH_SECRET,
  maxAgeSeconds = 60 * 60,
}) {
  if (!secret) {
    throw new Error(
      'buildSessionCookie: AUTH_SECRET is required to sign the session token — set it before invoking doctor auth probes',
    )
  }
  if (!userId || !role) {
    throw new Error('buildSessionCookie: userId and role are required')
  }

  const now = Math.floor(Date.now() / 1000)
  const token = await encode({
    token: {
      id: userId,
      role,
      email: email ?? `${userId}@example.com`,
      name: name ?? `probe-${role.toLowerCase()}`,
      sub: userId,
      iat: now,
      exp: now + maxAgeSeconds,
    },
    secret,
    salt: sessionCookieName(baseUrl),
  })

  const cookieName = sessionCookieName(baseUrl)
  return `${cookieName}=${token}`
}

/**
 * Seeded credentials used by the workflow + local doctor. These come
 * from prisma/seed.ts — if the seed stops creating any of them, the
 * probes will fail fast with a clear "user not found" error.
 */
export const SEEDED_PROBE_USERS = {
  customer: { email: 'cliente@test.com', role: 'CUSTOMER' },
  vendor: { email: 'productor@test.com', role: 'VENDOR' },
  admin: { email: 'admin@marketplace.com', role: 'SUPERADMIN' },
}

/**
 * Hit the app's own DB to resolve the cuid id for a seeded email.
 * We do this from the script (not hardcode the id) so the seed can
 * regenerate cuids freely — the probe finds whichever row exists.
 *
 * Uses the same Prisma client the app uses so we honour prisma.config.ts
 * adapters (pg-adapter, etc.).
 */
export async function resolveSeededUserId(email) {
  // Dynamic import so doctor.mjs can run without the DB layer loaded
  // (e.g. the `--skip-migrations --json` branch used by the
  // unauthenticated probe flow).
  const { db } = await import(`${process.cwd()}/src/lib/db.js`).catch(async () => {
    // `.ts` source — use tsx's default register path
    return await import(`${process.cwd()}/src/lib/db.ts`)
  })
  const row = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, firstName: true, lastName: true },
  })
  if (!row) {
    throw new Error(
      `resolveSeededUserId: no User with email=${email}. Seed the DB with \`npm run db:seed\` before running auth probes.`,
    )
  }
  return row
}

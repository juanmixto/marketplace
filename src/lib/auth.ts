import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import type { Adapter } from 'next-auth/adapters'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import type { Provider } from 'next-auth/providers'
import { db } from '@/lib/db'
import { authConfig } from './auth-config'
import { applyNormalizedAuthHostEnv } from './auth-host'
import { coerceUserRole } from '@/lib/roles'
import { normalizeAuthEmail } from '@/lib/auth-email'
import { splitProfileName } from '@/lib/auth-profile-name'
import { decideSocialSignIn } from '@/lib/auth-social-policy'
import { isMockOAuthEnabled, mockOAuthProvider } from '@/lib/auth-mock-oauth'
import { signAuthLinkToken } from '@/lib/auth-link-token'
import { isFeatureEnabled } from '@/lib/flags'
import { logger } from '@/lib/logger'
// eslint-disable-next-line no-restricted-imports -- credentials.ts is Prisma-backed and stays out of the auth barrel; src/lib/auth.ts is the only consumer
import { authorizeCredentials } from '@/domains/auth/credentials'
// eslint-disable-next-line no-restricted-imports -- two-factor.ts is Prisma-backed and stays out of the auth barrel; src/lib/auth.ts consumes it for the OAuth has2fa lookup
import { isTwoFactorEnabled } from '@/domains/auth/two-factor'

applyNormalizedAuthHostEnv(process.env)

const ROLE_REFRESH_INTERVAL_MS = 60_000

export const AUTH_FLAG_KILL_SOCIAL = 'kill-auth-social'

/**
 * The base PrismaAdapter ships a `createUser` that does:
 *   p.user.create({ data: { id, email, name, image, emailVerified } })
 *
 * Our `User` schema has `firstName` + `lastName` (required, non-null)
 * and NO `name` column. Without an override, the first OAuth signin
 * for any new email would 500 in production: Prisma rejects the
 * unknown `name` field AND the missing required `firstName`.
 *
 * `splitProfileName` maps Google's `name` → first/last with sensible
 * fallbacks (email local-part if name is empty). The cast is needed
 * because `AdapterUser` doesn't expose firstName/lastName, but the
 * adapter's `getUser*` methods just return whatever Prisma gives back
 * — Auth.js only consumes `id` / `email` / `emailVerified` from it.
 */
function buildAdapter(): Adapter {
  const base = PrismaAdapter(db) as Adapter
  return {
    ...base,
    async createUser(data) {
      const email = (data as { email?: string | null }).email ?? ''
      const name = (data as { name?: string | null }).name
      const { firstName, lastName } = splitProfileName(name, email)
      const created = await db.user.create({
        data: {
          email,
          emailVerified: data.emailVerified ?? null,
          image: (data as { image?: string | null }).image ?? null,
          firstName,
          lastName,
        },
      })
      logger.info('auth.user.created_via_oauth', {
        userId: created.id,
        hasName: Boolean(name),
      })
      // Cast: AdapterUser's required shape is { id, email, emailVerified } —
      // our User has all of those plus extras Auth.js ignores.
      return created as unknown as Awaited<ReturnType<NonNullable<Adapter['createUser']>>>
    },
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  adapter: buildAdapter(),
  trustHost: true,
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * OAuth gatekeeper. Implements the email-collision matrix in
     * `docs/auth/audit.md` §4 via the pure `decideSocialSignIn`
     * function. Returns:
     *   - true  : NextAuth proceeds (creates User+Account on first
     *             signin, or reuses existing Account on subsequent).
     *   - false : signIn rejected, NextAuth shows the error page.
     *   - "/login/link?token=…" : redirect to the password gate
     *     (#854-lite). The link token is HMAC-signed with AUTH_SECRET
     *     and expires in 5 minutes.
     *
     * Credentials path is left untouched — `authorizeCredentials`
     * already does its own gating, and this callback returns true
     * for non-OAuth sign-ins to preserve that behaviour.
     */
    async signIn({ user, account, profile }) {
      if (!account || account.type !== 'oauth') return true

      const rawEmail = (profile?.email as string | undefined) ?? user?.email
      if (!rawEmail) {
        // Apple may strip email after the first login. Without an
        // email we can't apply the matrix; let Auth.js handle (it
        // will fail validation). Logged for visibility.
        logger.warn('auth.social.no_email', { provider: account.provider })
        return false
      }

      const email = normalizeAuthEmail(rawEmail)
      const providerAccountId = account.providerAccountId

      const killSwitchEngaged = await isFeatureEnabled(AUTH_FLAG_KILL_SOCIAL, {
        email,
      })

      const existing = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          passwordHash: true,
          emailVerified: true,
          accounts: { select: { provider: true, providerAccountId: true } },
        },
      })

      const decision = decideSocialSignIn({
        killSwitchEngaged,
        provider: account.provider,
        providerAccountId,
        email,
        emailVerified: true,
        existingUser: existing
          ? {
              id: existing.id,
              hasPasswordHash: existing.passwordHash !== null,
              emailVerifiedAt: existing.emailVerified,
              accounts: existing.accounts,
            }
          : null,
      })

      if (decision.kind === 'allow') {
        logger.info('auth.social.allow', {
          provider: account.provider,
          isNewUser: !existing,
        })
        return true
      }

      if (decision.kind === 'deny') {
        logger.warn('auth.social.deny', {
          provider: account.provider,
          reason: decision.reason,
        })
        return false
      }

      // redirect_link
      const secret = process.env.AUTH_SECRET
      if (!secret) {
        logger.error('auth.social.missing_secret', { provider: account.provider })
        return false
      }
      const token = await signAuthLinkToken(
        {
          email: decision.email,
          provider: decision.provider,
          providerAccountId: decision.providerAccountId,
        },
        secret
      )
      logger.info('auth.link.required', {
        provider: account.provider,
        reason: decision.reason,
      })
      return `/login/link?token=${encodeURIComponent(token)}`
    },
    async jwt({ token, user, account, trigger }) {
      // Delegate initial login to the shared (edge-safe) callback.
      const base = await authConfig.callbacks?.jwt?.({ token, user, trigger })
      const next = base ?? token

      // First OAuth login: the credentials authorize() path stamps
      // `has2fa` + `needsOnboarding` on the user object, but
      // PrismaAdapter doesn't — its `user` is the Prisma User row.
      // Look up here so admins who sign in via Google still get
      // redirected to /admin/security/enroll by the proxy, and
      // brand-new OAuth users hit /onboarding before any protected
      // route. Lookup runs once on initial signin only.
      if (user && account?.type === 'oauth') {
        const id = (user as { id?: string }).id
        if (typeof id === 'string') {
          const [has2fa, fresh] = await Promise.all([
            isTwoFactorEnabled(id),
            db.user.findUnique({
              where: { id },
              select: { passwordHash: true, consentAcceptedAt: true },
            }),
          ])
          next.has2fa = has2fa
          // OAuth-only user with no consent yet → onboard. Linked
          // accounts (passwordHash present) skip — they consented at
          // /register.
          next.needsOnboarding = fresh
            ? fresh.passwordHash === null && fresh.consentAcceptedAt === null
            : false
        }
        return next
      }

      if (user) return next

      // Refresh the role from the DB at most once per interval so an admin
      // promotion (CUSTOMER → VENDOR via approveVendor) lands in the JWT on
      // the next poll instead of requiring a sign-out. Sessions with no id
      // (anonymous) are skipped. This is the only place in the stack where
      // a role can change mid-session without a credentials flow.
      const id = typeof next.id === 'string' ? next.id : null
      if (!id) return next

      const lastCheck = typeof next.roleCheckedAt === 'number' ? next.roleCheckedAt : 0
      const now = Date.now()
      if (trigger !== 'update' && now - lastCheck < ROLE_REFRESH_INTERVAL_MS) {
        return next
      }

      const fresh = await db.user.findUnique({
        where: { id },
        select: {
          role: true,
          isActive: true,
          passwordHash: true,
          consentAcceptedAt: true,
        },
      })
      if (!fresh || !fresh.isActive) return next
      next.role = coerceUserRole(fresh.role)
      next.roleCheckedAt = now
      // Refresh onboarding flag too — the /onboarding action calls
      // unstable_update with trigger='update' which lands here, and
      // we want the new claim to reflect the freshly-set
      // consentAcceptedAt without forcing a sign-out.
      next.needsOnboarding =
        fresh.passwordHash === null && fresh.consentAcceptedAt === null
      return next
    },
  },
  events: {
    async linkAccount({ user, account }) {
      logger.info('auth.account.linked', {
        userId: (user as { id?: string }).id,
        provider: account.provider,
      })
    },
  },
  providers: buildProviders(),
})

function buildProviders(): Provider[] {
  const providers: Provider[] = [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  ]

  // Google is registered iff both env vars are set. Keeping the
  // env-var presence as the boot-time gate (and `feat-auth-google`
  // as the user-visible cohort gate) means a deploy that ships the
  // code without secrets won't accidentally expose a broken button —
  // the SocialButtons server component reads the same vars + flag.
  // `allowDangerousEmailAccountLinking` stays false (default): the
  // signIn callback (this file) decides linking via the matrix.
  const googleId = process.env.AUTH_GOOGLE_ID
  const googleSecret = process.env.AUTH_GOOGLE_SECRET
  if (googleId && googleSecret) {
    providers.push(
      Google({
        clientId: googleId,
        clientSecret: googleSecret,
        // openid scope is implicit; keep "email profile" minimal —
        // we don't use Google APIs after login.
        authorization: { params: { scope: 'openid email profile' } },
      })
    )
  }

  // Test-only: a generic OAuth provider whose authorize / token /
  // userinfo endpoints are local Next.js routes under /api/__test__/.
  // Gate via the env var helper, which also refuses production. The
  // provider goes through the same signIn callback as Google, so the
  // matrix + adapter override + has2fa lookup all get exercised.
  if (isMockOAuthEnabled()) {
    providers.push(mockOAuthProvider())
  }

  return providers
}

export const isGoogleProviderConfigured = (
  env: Partial<NodeJS.ProcessEnv> = process.env
): boolean => Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)

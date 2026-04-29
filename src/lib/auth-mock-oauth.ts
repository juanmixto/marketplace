/**
 * Test-only OAuth provider that pretends to be a generic external IdP.
 * Wired into NextAuth in `src/lib/auth.ts` only when both:
 *
 *   - process.env.MOCK_OAUTH_ENABLED === '1'
 *   - process.env.PLAYWRIGHT_E2E_PROD_OAUTH === '1'
 *
 * The second flag is set exclusively in `playwright.config.ts`. The
 * previous gate used `NODE_ENV !== 'production'`, but `next start`
 * refuses to run with anything other than `NODE_ENV=production`, so
 * the Nightly `PLAYWRIGHT_USE_PROD=1` job (which runs against a real
 * production build) was silently locked out of mock-OAuth and every
 * social-login E2E spec hung on `page.waitForURL`. See #985.
 *
 * Defense in depth is preserved: an accidental `MOCK_OAUTH_ENABLED=1`
 * leak into a real prod deploy still 404s because nothing in the
 * deploy pipeline sets `PLAYWRIGHT_E2E_PROD_OAUTH`.
 *
 * The companion route handlers under `src/app/api/__test__/oauth/`
 * implement the authorize / token / userinfo endpoints. The flow:
 *
 *   1. Test sets `__mock_oauth_user` cookie (JSON: {email, name?, sub?}).
 *   2. Test clicks the trigger at /dev/oauth-trigger which calls
 *      signIn('mock-oauth') (the production /login UI never exposes it).
 *   3. NextAuth → /api/dev-oauth/authorize → reads the cookie,
 *      generates a code, redirects back to NextAuth's callback.
 *   4. NextAuth (server-side) → /api/dev-oauth/token → exchanges
 *      code for an access_token (the code itself is the token).
 *   5. NextAuth → /api/dev-oauth/userinfo with Bearer → returns
 *      the user info from the cookie.
 *   6. NextAuth profile() runs → adapter.createUser/getUserByAccount
 *      → signIn callback applies the email-collision matrix.
 *
 * No real network calls, no real Google. Production deploys never set
 * MOCK_OAUTH_ENABLED nor PLAYWRIGHT_E2E_PROD_OAUTH — the route
 * handlers 404 there because `isMockOAuthEnabled()` short-circuits.
 */
import type { OAuthConfig } from 'next-auth/providers'

export const MOCK_OAUTH_PROVIDER_ID = 'mock-oauth'
export const MOCK_OAUTH_USER_COOKIE = '__mock_oauth_user'

interface MockProfile {
  sub: string
  email: string
  name: string
  given_name?: string
  family_name?: string
  email_verified: true
}

export function isMockOAuthEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.MOCK_OAUTH_ENABLED === '1' && env.PLAYWRIGHT_E2E_PROD_OAUTH === '1'
}

export function mockOAuthProvider(): OAuthConfig<MockProfile> {
  // Auth.js needs an absolute authorize URL for the browser redirect.
  // Token / userinfo are server-side fetches; absolute URLs avoid Node
  // having to resolve a relative URL against an unknown base.
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
  return {
    id: MOCK_OAUTH_PROVIDER_ID,
    name: 'Mock OAuth (test only)',
    type: 'oauth',
    clientId: 'mock-client',
    clientSecret: 'mock-secret',
    authorization: {
      url: `${baseUrl}/api/dev-oauth/authorize`,
      params: { scope: 'openid email profile' },
    },
    token: `${baseUrl}/api/dev-oauth/token`,
    userinfo: `${baseUrl}/api/dev-oauth/userinfo`,
    // Skip PKCE / state / nonce checks in the mock provider only.
    // Auth.js core only runs a check when `provider.checks.includes(name)`
    // is true (see node_modules/@auth/core/lib/actions/callback/oauth/checks.js).
    // ['none'] matches none of pkce/state/nonce, so every check
    // short-circuits. Production providers (Google / Apple) keep the
    // default ['pkce', 'state']; this is exclusively for the mock
    // round-trip in tests.
    checks: ['none'],
    // Cast: ProfileCallback<MockProfile> expects a (profile, tokens) =>
    // Awaitable<User> where User has all-optional fields. We hand back
    // a strict shape that the adapter override consumes; the runtime
    // contract is wider than what the User type advertises.
    profile: ((profile: MockProfile) => ({
      id: profile.sub,
      email: profile.email,
      name: profile.name,
      image: null,
    })) as unknown as OAuthConfig<MockProfile>['profile'],
  }
}

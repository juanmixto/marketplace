/**
 * Test-only OAuth provider that pretends to be a generic external IdP.
 * Wired into NextAuth in `src/lib/auth.ts` only when both:
 *
 *   - process.env.MOCK_OAUTH_ENABLED === '1'
 *   - process.env.NODE_ENV !== 'production'
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
 * MOCK_OAUTH_ENABLED — the route handlers also 404 there as a second
 * defense.
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
  return env.MOCK_OAUTH_ENABLED === '1' && env.NODE_ENV !== 'production'
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
    // Skip PKCE / state / nonce checks in test — Auth.js handles state
    // automatically and our mock endpoints don't depend on them.
    checks: ['state'],
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

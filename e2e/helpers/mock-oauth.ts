import type { Page } from '@playwright/test'

export interface MockOAuthUser {
  email: string
  name: string
  /** Provider-side stable id. Defaults to `mock-<email>`; pass a value
   *  to simulate "same email, different sub" (matrix case C). */
  sub?: string
}

const COOKIE_NAME = '__mock_oauth_user'

/**
 * Sets the `__mock_oauth_user` cookie that the test-only authorize
 * endpoint reads. Call before driving the OAuth flow. Cookie scopes
 * to the dev origin (localhost), path / so subsequent requests carry
 * it.
 */
export async function setMockOAuthUser(page: Page, user: MockOAuthUser): Promise<void> {
  const url = new URL(page.url() === 'about:blank' ? 'http://localhost:3001' : page.url())
  await page.context().addCookies([
    {
      name: COOKIE_NAME,
      value: encodeURIComponent(JSON.stringify(user)),
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

/**
 * Drops every Account row written by the mock provider plus any user
 * whose existence depends on it. Idempotent. Run at the start of any
 * test that mutates auth state so spec ordering doesn't matter.
 */
export async function resetMockOAuthState(page: Page): Promise<void> {
  await page.request.post('/api/dev-oauth/cleanup')
}

/**
 * Drives the mock-oauth flow end-to-end: navigate to the trigger
 * page, click, wait for the destination URL. Caller MUST call
 * `setMockOAuthUser` first.
 *
 * Brand-new OAuth users land on /onboarding before reaching the
 * callbackUrl (proxy gate from #855). When `expectedUrlPattern`
 * doesn't match /onboarding, this helper completes the consent
 * form transparently so callers don't have to know about the
 * detour. Existing users (case D — credentials with passwordHash
 * set) skip the onboarding gate and land directly on callbackUrl.
 */
export async function startMockOAuth(
  page: Page,
  callbackUrl: string,
  expectedUrlPattern: RegExp
): Promise<void> {
  const onboardingPattern = /\/onboarding(?:[/?]|$)/
  const expectsOnboarding = onboardingPattern.test(expectedUrlPattern.source)
  await page.goto(`/dev/oauth-trigger?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  // waitUntil: 'commit' resolves as soon as the destination URL is
  // committed in the browser, without waiting for the destination's
  // full `load` event. The OAuth flow chain is all server-side 302
  // redirects (signIn → /api/auth/signin/* → callback → final URL),
  // so the URL is reliably committed even when a downstream RSC
  // compile slows the `load` to >30s on cold GitHub-hosted runners
  // (#985). The `expect(page).toHaveURL(...)` assertion in callers
  // is the real session/route check; this `waitForURL` is just the
  // navigation gate.
  await Promise.all([
    page.waitForURL(expectsOnboarding ? expectedUrlPattern : /\/(onboarding|cuenta|admin|vendor|carrito|checkout|productos|productores)/, {
      timeout: 30_000,
      waitUntil: 'commit',
    }),
    page.getByTestId('mock-oauth-trigger').click(),
  ])
  if (expectsOnboarding) return
  // If the proxy detoured us through /onboarding, accept the consent
  // and continue to the original callbackUrl.
  const url = new URL(page.url())
  if (url.pathname === '/onboarding') {
    await page.locator('input[name="consent"]').check()
    await Promise.all([
      page.waitForURL(expectedUrlPattern, { timeout: 30_000, waitUntil: 'commit' }),
      page.locator('button[type="submit"]').click(),
    ])
  }
}

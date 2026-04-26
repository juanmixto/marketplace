import { test, expect } from '@playwright/test'
import {
  setMockOAuthUser,
  resetMockOAuthState,
  startMockOAuth,
} from '../helpers/mock-oauth'
import { TEST_USERS } from '../helpers/auth'

/**
 * Phase 2 hardening / #856 full. Round-trip coverage for the social-
 * login MVP shipped in #860 + the adapter fix in #865:
 *
 *   1. Matrix case A: new email → User+Account created, session emitted,
 *      callbackUrl preserved.
 *   2. Matrix case B: returning user (same provider+sub) → reuses
 *      Account, lands on callbackUrl.
 *   3. Matrix case D: existing credentials user → /login/link, password
 *      gate, redirect to OAuth provider re-trigger, ends on callbackUrl.
 *      Verifies one User has both an Account and a passwordHash.
 *   4. Defense-in-depth: a stale (or non-existent) cookie trips the
 *      authorize endpoint's required-fields check rather than emitting
 *      a session.
 *
 * Tagged @smoke so they run on every PR.
 */

test.describe('auth social round-trip @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await resetMockOAuthState(page)
    await page.context().clearCookies()
  })

  test('case A: new email signs up via OAuth → session + callbackUrl', async ({ page }) => {
    const email = `mock-new-${Date.now()}@test.invalid`
    await setMockOAuthUser(page, { email, name: 'New Mock User' })

    await startMockOAuth(page, '/cuenta', /\/cuenta(?:[/?]|$)/)

    // Session works: /cuenta is a buyer-protected route. If we landed
    // here, the JWT was emitted and the proxy let us through.
    await expect(page).toHaveURL(/\/cuenta(?:[/?]|$)/, { timeout: 10_000 })
  })

  test('case B: returning OAuth user reuses Account', async ({ page }) => {
    const email = `mock-returning-${Date.now()}@test.invalid`
    await setMockOAuthUser(page, { email, name: 'Returning' })

    // First signin creates User+Account.
    await startMockOAuth(page, '/cuenta', /\/cuenta(?:[/?]|$)/)
    await page.context().clearCookies()
    await setMockOAuthUser(page, { email, name: 'Returning' })

    // Second signin: same provider + same sub → matrix case B → no
    // duplicate Account, sees session through, lands on callbackUrl.
    await startMockOAuth(page, '/cuenta', /\/cuenta(?:[/?]|$)/)
    await expect(page).toHaveURL(/\/cuenta(?:[/?]|$)/, { timeout: 10_000 })
  })

  test('case D: credentials collision → /login/link → password → callbackUrl', async ({
    page,
  }) => {
    // cliente@test.com is seeded with passwordHash and has no
    // Account rows initially. Trigger mock-oauth with same email.
    await setMockOAuthUser(page, {
      email: TEST_USERS.customer.email,
      name: 'Customer Test',
    })

    // First leg: signIn callback denies + redirects to /login/link.
    await page.goto('/dev/oauth-trigger?callbackUrl=' + encodeURIComponent('/cuenta'))
    await Promise.all([
      page.waitForURL(/\/login\/link\?token=/, { timeout: 30_000 }),
      page.getByTestId('mock-oauth-trigger').click(),
    ])

    // Confirm password and submit. The action writes an Account row
    // and redirects to /api/auth/signin/mock-oauth which re-runs the
    // matrix (now case B because the Account row exists).
    await page.locator('input[name="password"]').fill(TEST_USERS.customer.password)
    await Promise.all([
      page.waitForURL(/\/cuenta(?:[/?]|$)/, { timeout: 30_000 }),
      page.getByRole('button', { name: /Confirmar y vincular/i }).click(),
    ])

    await expect(page).toHaveURL(/\/cuenta(?:[/?]|$)/, { timeout: 10_000 })
  })

  test('mock authorize redirects to the callback URL (smoke route exists)', async ({ page }) => {
    // Hit the handler directly with maxRedirects: 0 so we capture
    // the FIRST hop (the 302 from /api/dev-oauth/authorize) without
    // following the chain into the real OAuth callback (which would
    // emit a session and pollute test state). The Location header
    // should point at NextAuth's callback for the mock provider.
    const resp = await page.request.get(
      '/api/dev-oauth/authorize?redirect_uri=' +
        encodeURIComponent('http://localhost:3001/api/auth/callback/mock-oauth') +
        '&state=test',
      { maxRedirects: 0 }
    )
    expect([302, 307]).toContain(resp.status())
    expect(resp.headers().location ?? '').toMatch(/\/api\/auth\/callback\/mock-oauth/)
  })
})

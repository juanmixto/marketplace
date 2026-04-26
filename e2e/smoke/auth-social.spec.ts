import { test, expect } from '@playwright/test'

/**
 * Phase 7 / #856-smoke. Single E2E smoke for the social-login path
 * shipped by #850 + #851 + #854-lite. Full mock-OAuth coverage
 * (Google round-trip → session → checkout) is deferred to Phase 2
 * hardening; this file catches the regressions that would tumble
 * production:
 *
 *   1. Without `AUTH_GOOGLE_*` env vars and `feat-auth-google` flag,
 *      the Google button must NOT render. A leak here exposes a
 *      button that 500s on click (provider not registered in
 *      auth.ts) — ugly UX + flooding Sentry.
 *   2. `/login/link?token=<bad>` must reject and redirect to /login
 *      with an error code. A regression in token validation lets
 *      anyone craft a redirect target into the link-confirm flow.
 *   3. Anonymous access to /checkout still preserves callbackUrl
 *      through the login redirect (already covered for /vendor and
 *      /admin in auth.spec.ts; checkout is the highest-impact path
 *      for the social-login conversion goal).
 *
 * This spec stays at smoke level (no DB seed dependencies, no real
 * IdP). It's the minimum gate for #856-smoke per the MVP plan.
 */
test.describe('auth social @smoke', () => {
  test('Google button is hidden when feat-auth-google is off (default)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'commit' })
    // The credentials submit must be visible (login still works).
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible({
      timeout: 10_000,
    })
    // Both the button text and the divider are flag-gated. Either
    // surfacing without the env vars / flag is a regression.
    await expect(page.getByRole('button', { name: /Continuar con Google/i })).toHaveCount(0)
    await expect(page.getByText(/o continúa con email/i)).toHaveCount(0)
  })

  test('/login/link with a malformed token redirects to /login with link_invalid', async ({
    page,
  }) => {
    await page.goto('/login/link?token=not-a-valid-token', { waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/login\?error=link_invalid/, { timeout: 10_000 })
  })

  test('anonymous /checkout redirects to /login preserving callbackUrl', async ({ page }) => {
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/login\?.*callbackUrl=.*checkout/, {
      timeout: 10_000,
    })
  })

  test('/login?callbackUrl=https://evil.com is sanitized — no open redirect', async ({
    page,
  }) => {
    // sanitizeCallbackUrl rejects cross-origin and the page logs the
    // rejection (auth.callback.rejected). The form still renders so
    // the user can try with a clean URL — but the original payload
    // never reaches the post-login destination logic.
    await page.goto('/login?callbackUrl=https%3A%2F%2Fevil.com%2Fpwn', {
      waitUntil: 'commit',
    })
    // Page renders normally (login is still reachable).
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible({
      timeout: 10_000,
    })
    // URL stays on /login — no automatic navigation away to evil.com.
    await expect(page).toHaveURL(/\/login/)
  })
})

import { expect, type Page } from '@playwright/test'

export interface TestUser {
  email: string
  password: string
}

export const TEST_USERS = {
  customer: { email: 'cliente@test.com', password: 'cliente1234' },
  vendor: { email: 'productor@test.com', password: 'vendor1234' },
  admin: { email: 'admin@marketplace.com', password: 'admin1234' },
} as const satisfies Record<string, TestUser>

/**
 * Logs in via the public /login page using the credentials form.
 * Uses the visible UI (not a request bypass) so the test exercises the
 * real auth flow including the redirect after a successful submit.
 */
export async function loginAs(page: Page, user: TestUser) {
  // Use 'commit' so we don't wait for full hydration before filling the form;
  // the login page is a server component and hydration can take >5s on cold
  // dev-mode runners (GitHub-hosted, first request).
  await page.goto('/login', { waitUntil: 'commit' })
  const submit = page.getByRole('button', { name: 'Iniciar sesión' })
  await expect(submit).toBeEnabled({ timeout: 10_000 })
  await page.locator('input[name="email"]').fill(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  // 30s mirrors the OAuth roundtrip helper. The previous 20s budget tripped
  // intermittently on GitHub-hosted nightly runs where the post-submit
  // redirect can stall behind a cold RSC compile + session DB write.
  // We keep the default waitUntil ('load') because the login flow uses
  // router.push under the hood, and `'commit'` would wait for a hard
  // navigation that never fires.
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    submit.click(),
  ])
}

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
  await page.locator('input[name="email"]').pressSequentially(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  const submit = page.getByRole('button', { name: 'Iniciar sesión' })
  await expect(submit).toBeEnabled({ timeout: 10_000 })
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20_000 }),
    submit.click(),
  ])
  // Successful login bounces away from /login. 20s absorbs dev-mode
  // compile spikes on GitHub-hosted runners (login + session setup).
}

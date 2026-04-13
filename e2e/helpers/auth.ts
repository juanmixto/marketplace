import type { Page } from '@playwright/test'

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
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  // Successful login bounces away from /login. Wait until the URL changes
  // so callers can immediately assert against the destination.
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 10_000 })
}

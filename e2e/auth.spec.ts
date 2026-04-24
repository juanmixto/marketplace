import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from './helpers/auth'

test.describe('auth @smoke', () => {
  test('customer can log in with seeded credentials', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)
    // Assert authentication behaviorally: a logged-in customer can reach
    // /cuenta without being redirected back to /login. Probing the navbar
    // is brittle because the account entry is a dropdown trigger button
    // whose text is the user's first name when it exists — not a stable
    // selector.
    await page.goto('/cuenta')
    await expect(page).toHaveURL(/\/cuenta(?:\/|$|\?)/, { timeout: 10_000 })
  })

  test('login with wrong credentials surfaces an error', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[name="email"]').pressSequentially('cliente@test.com')
    await page.locator('input[name="password"]').fill('definitely-wrong-password')
    const submit = page.getByRole('button', { name: 'Iniciar sesión' })
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()
    // Stay on /login and show an inline error message. We don't pin the
    // exact wording — just that something user-facing surfaces.
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('p.text-red-700, p.text-red-300')).toBeVisible({ timeout: 5_000 })
  })

  test('anonymous access to /vendor/dashboard redirects to /login with callbackUrl', async ({ page }) => {
    await page.goto('/vendor/dashboard')
    await expect(page).toHaveURL(/\/login\?.*callbackUrl=/)
  })

  test('anonymous access to /admin/dashboard redirects to /login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})

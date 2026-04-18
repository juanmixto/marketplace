import { expect, test } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

test.describe('vendor profile @smoke', () => {
  test('vendor profile page renders after login', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)

    await page.goto('/vendor/perfil')

    await expect(page.getByRole('heading', { name: /mi perfil/i })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /informaci[oó]n p[uú]blica|public information/i }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[name="displayName"]')).toBeVisible()
  })
})

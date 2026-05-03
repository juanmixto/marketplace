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
    // Use a role+label query (not [name="displayName"]) and target the
    // first match. Under React streaming hydration the form briefly renders
    // twice on slow runners (server-rendered + client-hydrated overlap),
    // tripping Playwright strict mode on the bare attribute selector.
    // The heading assertion above already proves the public-info section
    // is present; this is a smoke check that the input exists at all.
    await expect(
      page.getByRole('textbox', { name: /nombre del productor|producer name/i }).first(),
    ).toBeVisible()
  })
})

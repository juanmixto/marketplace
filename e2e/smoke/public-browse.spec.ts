import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('public browse @smoke', () => {
  test('home page has no critical a11y violations (axe)', async ({ page }) => {
    await page.goto('/')
    // Wait for the hero to be rendered so axe runs against the hydrated
    // DOM, not the initial loading shell.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 5_000,
    })
    // Scope:
    //   - wcag2a + wcag2aa tags only (`best-practice` is subjective).
    //   - impact=critical only. The site has ~300 pre-existing violations
    //     at wcag2aa (mostly color-contrast on dark-mode tokens and
    //     moderate-severity landmark issues). Fixing all of them is a
    //     project on its own, out of scope for a smoke gate.
    //     This assertion keeps the loudest regressions out while not
    //     blocking PRs on a baseline we already ship in production.
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(
      critical,
      `home page has ${critical.length} critical axe violations: ${critical.map(v => v.id).join(', ')}`,
    ).toEqual([])
  })


  test('home page renders with hero and featured content', async ({ page }) => {
    await page.goto('/')
    // The home page should expose a primary heading. We don't pin the exact
    // copy — marketing tweaks it often — just that an h1 is rendered.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 5_000,
    })
    // And at least one link into the catalog (product or producer card) is
    // reachable from the landing page.
    await expect(
      page.getByRole('link', { name: /producto|productor|ver|comprar/i }).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('catalog lists seeded products', async ({ page }) => {
    await page.goto('/productos')
    await expect(page.getByText(/tomates cherry/i).first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test('product detail renders without hydration errors', async ({ page }) => {
    await page.goto('/productos/tomates-cherry-ecologicos')
    // Product name as a heading — level is intentionally unasserted so a
    // future h1/h2 swap doesn't break the smoke test.
    await expect(
      page.getByRole('heading', { name: /tomates cherry/i }).first(),
    ).toBeVisible({ timeout: 5_000 })
    // Price. Seed says €3.50; accept comma or dot decimal, or just the € sign.
    await expect(page.getByText(/3[.,]5|€/).first()).toBeVisible({ timeout: 5_000 })
    // Add-to-cart style button.
    await expect(
      page.getByRole('button', { name: /añadir al carrito|añadir|carrito/i }).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('navigation back to catalog works from product detail', async ({ page }) => {
    await page.goto('/productos/tomates-cherry-ecologicos')
    // Click any link that points back to the catalog index. Using href is
    // resilient to copy changes (breadcrumb vs "ver más", etc.).
    await page.locator('a[href="/productos"]').first().click()
    await expect(page).toHaveURL(/\/productos\/?$/, { timeout: 5_000 })
  })
})

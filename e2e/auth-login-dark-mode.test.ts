import { test, expect } from '@playwright/test'

test.describe('Auth Login - Dark Mode Visual', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set dark mode preference
    await context.addInitScript(() => {
      localStorage.setItem('marketplace-theme', 'dark')
    })
  })

  test('should render login form with dark mode styles', async ({ page }) => {
    await page.goto('/login')

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Verify dark mode class is applied
    const htmlElement = page.locator('html')
    const classes = await htmlElement.getAttribute('class')
    expect(classes).toContain('dark')

    // Verify inputs have correct dark mode styling
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')

    // Get computed styles
    const emailBgColor = await emailInput.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    const passwordBgColor = await passwordInput.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )

    // In dark mode, surface should be #161b22, not white (#ffffff)
    expect(emailBgColor).not.toBe('rgb(255, 255, 255)')
    expect(passwordBgColor).not.toBe('rgb(255, 255, 255)')

    // Verify foreground text color is light (not dark)
    const textColor = await emailInput.evaluate(el =>
      window.getComputedStyle(el).color
    )
    // Light colors should have higher RGB values
    const rgbMatch = textColor.match(/\d+/g)
    if (rgbMatch && rgbMatch.length >= 3) {
      const [r, g, b] = rgbMatch.map(Number)
      const brightness = (r + g + b) / 3
      expect(brightness).toBeGreaterThan(100) // Light text
    }

    // Take screenshot for visual verification
    await expect(page).toHaveScreenshot('login-dark-mode.png', {
      fullPage: true,
    })
  })

  test('should render login form with light mode styles when preference is light', async ({
    page,
    context,
  }) => {
    // Clear dark mode and set light mode
    await context.addInitScript(() => {
      localStorage.removeItem('marketplace-theme')
      localStorage.setItem('marketplace-theme', 'light')
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // Verify dark mode class is NOT applied
    const htmlElement = page.locator('html')
    const classes = await htmlElement.getAttribute('class')
    expect(classes).not.toContain('dark')

    // Take screenshot for visual verification
    await expect(page).toHaveScreenshot('login-light-mode.png', {
      fullPage: true,
    })
  })

  test('should not have white flash on dark mode navigation', async ({
    page,
    context,
  }) => {
    // Set dark mode
    await context.addInitScript(() => {
      localStorage.setItem('marketplace-theme', 'dark')
    })

    // Navigate to login
    await page.goto('/login')

    // Check that html has dark class immediately (SSR)
    const htmlElement = page.locator('html')
    const initialClasses = await htmlElement.getAttribute('class')
    expect(initialClasses).toContain('dark')

    // Get the background color set via inline style
    const bgColor = await htmlElement.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    // Should be dark (#0d1117), not light
    expect(bgColor).not.toBe('rgb(245, 242, 236)')
  })
})

import { test, expect } from '@playwright/test'

// Exact CSS variable values from src/app/globals.css.
// If these change in globals.css, update them here.
const DARK_TOKENS = {
  background: 'rgb(13, 17, 23)',     // #0d1117
  surface:    'rgb(22, 27, 34)',     // #161b22
  foreground: 'rgb(230, 237, 243)',  // #e6edf3
} as const

const LIGHT_TOKENS = {
  background: 'rgb(245, 242, 236)',  // #f5f2ec
  surface:    'rgb(255, 255, 255)',  // #ffffff
  foreground: 'rgb(28, 32, 32)',     // #1c2020
} as const

test.describe('Auth Login - Dark Mode Visual', () => {
  test('dark mode: CSS variables resolve to DARK values, not light', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      localStorage.setItem('marketplace-theme', 'dark')
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // 1. The bootstrap script must add the .dark class to <html>
    const htmlClass = await page.locator('html').getAttribute('class')
    expect(htmlClass).toContain('dark')

    // 2. var(--background) on body must resolve to DARK, not LIGHT.
    //    This is the actual user-visible bug: if --background is light,
    //    the page looks light even though .dark is on <html>.
    const bodyBg = await page.locator('body').evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    expect(bodyBg).toBe(DARK_TOKENS.background)
    expect(bodyBg).not.toBe(LIGHT_TOKENS.background)

    // 3. var(--surface) on inputs must resolve to DARK
    const emailBg = await page.locator('input[type="email"]').evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    expect(emailBg).toBe(DARK_TOKENS.surface)
    expect(emailBg).not.toBe(LIGHT_TOKENS.surface)

    // 4. var(--foreground) on body must resolve to DARK (= light text)
    const bodyColor = await page.locator('body').evaluate(el =>
      window.getComputedStyle(el).color
    )
    expect(bodyColor).toBe(DARK_TOKENS.foreground)
    expect(bodyColor).not.toBe(LIGHT_TOKENS.foreground)

    // 5. Read the raw CSS custom properties at <html> level.
    //    If the .dark rule isn't winning over :root, this catches it.
    const htmlVars = await page.locator('html').evaluate(el => {
      const cs = window.getComputedStyle(el)
      return {
        background: cs.getPropertyValue('--background').trim(),
        surface:    cs.getPropertyValue('--surface').trim(),
        foreground: cs.getPropertyValue('--foreground').trim(),
      }
    })
    expect(htmlVars.background).toBe('#0d1117')
    expect(htmlVars.surface).toBe('#161b22')
    expect(htmlVars.foreground).toBe('#e6edf3')

    // 6. Visual snapshot for the human-eye check
    await expect(page).toHaveScreenshot('login-dark-mode.png', { fullPage: true })
  })

  test('light mode: CSS variables resolve to LIGHT values', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      localStorage.setItem('marketplace-theme', 'light')
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const htmlClass = await page.locator('html').getAttribute('class')
    expect(htmlClass).not.toContain('dark')

    const bodyBg = await page.locator('body').evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    expect(bodyBg).toBe(LIGHT_TOKENS.background)

    const emailBg = await page.locator('input[type="email"]').evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    expect(emailBg).toBe(LIGHT_TOKENS.surface)

    await expect(page).toHaveScreenshot('login-light-mode.png', { fullPage: true })
  })

  test('dark mode: Google sign-in button uses dark variant (not white)', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      localStorage.setItem('marketplace-theme', 'dark')
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const googleBtn = page.locator('[data-testid="social-google-button"]')

    // If the social provider is disabled by env/flag, skip silently —
    // the button just isn't rendered.
    if ((await googleBtn.count()) === 0) test.skip()

    const bg = await googleBtn.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )

    // Must NOT be white. Per Google brand guidelines, the dark variant
    // is #131314 (rgb(19, 19, 20)).
    expect(bg).not.toBe('rgb(255, 255, 255)')
    expect(bg).toBe('rgb(19, 19, 20)')
  })

  test('dark mode: <html> background-color attribute is dark from frame 0', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      localStorage.setItem('marketplace-theme', 'dark')
    })

    await page.goto('/login')

    // The bootstrap script in <head> sets html.style.backgroundColor BEFORE
    // first paint. If it doesn't, the user sees a white flash.
    const inlineBg = await page.locator('html').evaluate(el =>
      (el as HTMLElement).style.backgroundColor
    )
    expect(inlineBg).toBe('rgb(13, 17, 23)') // #0d1117
  })
})

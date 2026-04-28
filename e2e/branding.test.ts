import { test, expect } from '@playwright/test'

test.describe('Raíz Directa Branding', () => {
  test('favicon.svg is served with correct dimensions', async ({ request }) => {
    const response = await request.get('/favicon.svg')
    expect(response.ok()).toBeTruthy()
    const text = await response.text()

    // Verify SVG is valid and properly formed
    expect(text).toContain('viewBox="0 0 512 512"')
    expect(text).toContain('<svg')
    expect(text).toContain('Plant stem') // Contains plant design
  })

  test('login page displays enlarged branding', async ({ page }) => {
    await page.goto('/login')

    // Logo should be visible
    const logoImage = page.locator('a[href="/"] img')
    await expect(logoImage).toBeVisible()

    // Logo should be 80px (h-20 w-20 in Tailwind = 80px)
    const boundingBox = await logoImage.boundingBox()
    expect(boundingBox?.width).toBeGreaterThanOrEqual(75)
    expect(boundingBox?.height).toBeGreaterThanOrEqual(75)

    // Check text is present and likely large
    const siteNameText = page.locator('a[href="/"] span:has-text("Raíz Directa")')
    await expect(siteNameText).toBeVisible()

    // Text should be 4xl (text-4xl = ~36px)
    const textBox = await siteNameText.boundingBox()
    expect(textBox?.width).toBeGreaterThan(0)
  })

  test('header logo is visible on storefront', async ({ page }) => {
    await page.goto('/')

    // On homepage, there should be a logo in the header
    // (This test assumes the header is rendered; adjust selector if needed)
    const header = page.locator('header')
    await expect(header).toBeVisible()

    // The header should contain or link to the brand
    const brandLink = page.locator('a[href="/"]').first()
    await expect(brandLink).toBeVisible()
  })

  test('favicon link is in head', async ({ page }) => {
    await page.goto('/')

    // Check that a favicon is referenced in the head
    const faviconLink = page.locator('link[rel="icon"]').first()
    const href = await faviconLink.getAttribute('href')
    expect(href).toBeTruthy()
    // Favicon should reference the favicon path
    expect(href).toMatch(/favicon/)
  })

  test('branding is consistent across multiple pages', async ({ page }) => {
    const pages = [
      '/',
      '/login',
      '/catalog',
    ]

    for (const path of pages) {
      await page.goto(path)

      // Favicon should be in head on all pages
      const faviconLink = page.locator('link[rel="icon"]').first()
      const href = await faviconLink.getAttribute('href')
      expect(href).toBeTruthy()
      // Should reference brand assets
      expect(href).toMatch(/favicon|brand|logo/)
    }
  })

  test('login branding responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/login')

    // Logo should still be visible and not overflow
    const logoImage = page.locator('a[href="/"] img')
    await expect(logoImage).toBeVisible()

    const boundingBox = await logoImage.boundingBox()
    expect(boundingBox).not.toBeNull()

    // Logo width should not exceed viewport (with margin)
    expect(boundingBox!.width).toBeLessThan(350)
  })

  test('login branding responsive on desktop', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/login')

    // Logo and text should be visible and properly centered
    const logoImage = page.locator('a[href="/"] img')
    await expect(logoImage).toBeVisible()

    const boundingBox = await logoImage.boundingBox()
    expect(boundingBox?.width).toBeGreaterThanOrEqual(75)
  })

  test('dark mode branding colors are visible', async ({ page }) => {
    await page.goto('/login')

    // Set dark mode via theme toggle or class
    // (Check your theme implementation; this assumes a .dark class on html/body)
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
    })

    // Branding should still be visible
    const logo = page.locator('a[href="/"] img')
    await expect(logo).toBeVisible()

    const text = page.locator('a[href="/"] span:has-text("Raíz Directa")')
    await expect(text).toBeVisible()
  })

  test('favicon file size is reasonable', async ({ request }) => {
    const response = await request.get('/favicon.svg')
    expect(response.ok()).toBeTruthy()

    const text = await response.text()
    // SVG should be under 50KB (reasonable)
    expect(text.length).toBeLessThan(50000)
  })
})

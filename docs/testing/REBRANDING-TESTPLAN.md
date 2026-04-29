# Raíz Directa Rebranding - Test Plan

## Visual Branding Elements Being Tested

### 1. Favicon (Public Brand Mark)
**What changed:** favicon.svg rewritten with 512x512 viewBox, thick 24px border stroke, enlarged leaf/stem elements
**Where visible:** Browser tabs, favorites, PWA installations, address bar

#### Tests

- [ ] **Tab favicon visibility**
  - Open https://dev.feldescloud.com/ in browser
  - Open multiple tabs next to each other (compare with other sites' favicons)
  - Favicon must be clearly visible at 16px and 32px sizes (not tiny/minuscule)
  - On Chrome, Firefox, Safari: favicon appears crisp and green
  - Verify it's NOT pixelated or blurry at small sizes

- [ ] **Favicon rendering across all pages**
  - Visit /login → favicon visible
  - Visit / → favicon visible  
  - Visit /catalog → favicon visible
  - Visit /vendor → favicon visible
  - Visit /admin → favicon visible
  - Favicon must be identical across all pages

- [ ] **PWA manifest favicon**
  - Inspect `/manifest.json` (check Network tab)
  - icons array includes favicon.svg reference
  - On mobile: PWA "Add to Home Screen" shows correct icon

- [ ] **Browser cache bypass**
  - Hard-refresh (Ctrl+Shift+R or Cmd+Shift+R)
  - Favicon must update immediately (not stale from cache)

### 2. Login Page Branding
**What changed:** BrandMark increased to 80px, text increased to 4xl, gap increased to 4
**Where visible:** https://dev.feldescloud.com/login

#### Tests

- [ ] **Login page logo + text size**
  - Navigate to /login
  - Logo + "Raíz Directa" text are prominent and easy to read
  - NOT tiny/minuscule anymore
  - Vertical alignment: icon and text align horizontally with no misalignment
  - Gap between icon and text is consistent

- [ ] **Login page responsive (mobile)**
  - Resize browser to mobile width (375px)
  - Logo + text layout does NOT break or overflow
  - Text does NOT wrap unexpectedly
  - Tap targets remain accessible (no overlaps)

- [ ] **Login page responsive (tablet/desktop)**
  - Resize to 768px, 1024px, 1280px
  - Branding stays proportional and centered
  - Modal form width does NOT collapse or get crushed

- [ ] **Login page dark/light mode**
  - Visit /login in light theme
  - Logo and text colors are correct (not washed out or invisible)
  - Switch to dark theme (use theme toggle if visible on page, or browser DevTools)
  - Logo and text colors are correct in dark theme
  - No color contrast issues (WCAG AAA compliant)

### 3. Header Logo (All Pages)
**What changed:** BrandMark size increased from 48px to 64px in main Header component
**Where visible:** All pages except /login (which has its own layout)

#### Tests

- [ ] **Header logo on storefront**
  - Visit https://dev.feldescloud.com/ 
  - Logo in header is prominently sized (64px, not tiny 48px)
  - Text "Raíz Directa" is visible next to logo (if header includes it)
  - Not squished or distorted

- [ ] **Header logo on catalog page**
  - Visit /catalog
  - Logo size is consistent with homepage
  - Logo does NOT overlap with search bar or other header elements

- [ ] **Header logo on product detail**
  - Visit /catalog/[product-slug]
  - Logo maintains size and alignment

- [ ] **Header logo responsive (mobile)**
  - Resize to 375px
  - Logo does NOT overflow or break layout
  - Hamburger menu (if present) doesn't collide with logo

- [ ] **Header logo dark/light theme**
  - Toggle theme and verify logo colors are correct in both modes

### 4. Checkout Confirmation Page
**What changed:** Logo and branding should be visible on order confirmation (was reported missing)
**Where visible:** /checkout/confirmacion?orderNumber=...

#### Tests (if applicable)

- [ ] **Confirmation page branding**
  - Complete a test order (or check existing order)
  - Visit /checkout/confirmacion?orderNumber=MP-2026-XXXXX
  - Logo is visible at the top of page
  - "Gracias" (thank you) message is visible
  - Order details are properly branded
  - Logo size is consistent with other pages

### 5. Integration Tests (Playwright/Cypress)

Create/update test file: `e2e/branding.test.ts`

```typescript
describe('Raíz Directa Branding', () => {
  test('favicon.svg is served correctly', async ({ request }) => {
    const response = await request.get('/favicon.svg')
    expect(response.ok()).toBeTruthy()
    const text = await response.text()
    expect(text).toContain('512')
    expect(text).toContain('22C55E') // green color
    expect(text).toContain('0F766E') // dark green
  })

  test('login page displays large branding', async ({ page }) => {
    await page.goto('/login')
    const logo = page.locator('img[alt*="Raíz"]')
    await expect(logo).toBeVisible()
    // BrandMark should be 80px (h-20 w-20)
    const box = await logo.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(75)
    expect(box?.height).toBeGreaterThanOrEqual(75)
  })

  test('header logo is visible on storefront', async ({ page }) => {
    await page.goto('/')
    const headerLogo = page.locator('header img[alt*="Raíz"]')
    await expect(headerLogo).toBeVisible()
    const box = await headerLogo.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(60) // 64px
  })

  test('branding is consistent across pages', async ({ page }) => {
    const pages = ['/', '/catalog', '/vendor']
    for (const path of pages) {
      await page.goto(path)
      const favicon = page.locator('link[rel="icon"]')
      await expect(favicon).toHaveAttribute('href', '/favicon.svg')
    }
  })
})
```

## Regression Tests

- [ ] **PWA install still works**
  - On mobile: "Add to Home Screen" prompt appears
  - Installed app launches and displays correctly
  - App icon matches branding

- [ ] **SEO meta tags still correct**
  - `<meta property="og:image">` still points to correct OG image
  - `<title>` tag is correct
  - `<meta name="description">` is present

- [ ] **Performance not degraded**
  - Favicon.svg file size is reasonable (~2-3KB)
  - Page load times unchanged
  - No 404s or missing resources in Network tab

## Sign-Off Checklist

- [ ] Favicon clearly visible at 16-32px (browser tab)
- [ ] Login page branding is prominent (80px logo + 4xl text)
- [ ] Header logo is 64px on all non-auth pages
- [ ] No mobile layout breaks (responsive 375px-1920px)
- [ ] Dark/light theme colors correct
- [ ] All pages show consistent branding
- [ ] No 404s or failed requests
- [ ] Performance baseline maintained

---

## How to Run

### Manual Testing
1. Ensure dev server running: `npm run dev` (port 3001)
2. Go through each test above manually in the browser
3. Check multiple browsers (Chrome, Firefox, Safari)
4. Document any failures or observations

### Automated Testing
```bash
# Run Playwright tests (if created)
npm run test:e2e

# Check favicon specifically
curl -s http://localhost:3001/favicon.svg | head -5
```

### Hard Refresh
If you see old branding:
- **Chrome/Firefox:** Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- **Safari:** Cmd+Shift+R (or menu: Develop → Empty Web Site Cache)

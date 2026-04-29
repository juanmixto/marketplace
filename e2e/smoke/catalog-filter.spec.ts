// Business risk: catalog filters are part of the "trust" surface.
// A buyer who lands on /productos and selects a category expects to
// see only products in that category. Today the unit test
// `test/features/catalog-sort.test.ts` covers the sort parameter
// in isolation, but no test asserts the user-visible filter result
// in a real browser against the seeded catalog. If the
// `categoria` query param ever stops being respected (handler
// regression, query-builder bug, accidental cache-tag swap), the
// catalog silently shows everything and the buyer has no way to
// narrow down — a confidence break with no visible error.

import { test, expect } from '@playwright/test'

test.describe('catalog category filter @smoke', () => {
  test('categoria=lacteos excludes vegetable products from /productos', async ({ page }) => {
    // Sanity: vegetables are visible on the unfiltered catalog. This
    // anchors the negative assertion below — if `tomates cherry` were
    // hidden for an unrelated reason (catalog empty, slug renamed),
    // the assertion that the filter excluded them would be a false
    // positive. Asserting both sides keeps the test honest.
    await page.goto('/productos')
    await expect(page.getByText(/tomates cherry/i).first()).toBeVisible({ timeout: 10_000 })

    // `categoria` is the public filter param (see (public)/productos/page.tsx).
    // `lacteos` is the seeded slug for the "Lácteos y Huevos" category.
    await page.goto('/productos?categoria=lacteos')

    // The cheese product belongs to the dairy category and must be
    // present under the filter.
    await expect(page.getByText(/queso.*cabra/i).first()).toBeVisible({ timeout: 10_000 })

    // The tomato product belongs to "verduras" and must NOT appear
    // under categoria=lacteos. Use toHaveCount(0) rather than
    // toBeHidden() — Playwright's strict-mode otherwise treats the
    // empty result as a pass for the wrong reason.
    await expect(page.getByText(/tomates cherry/i)).toHaveCount(0)
  })
})

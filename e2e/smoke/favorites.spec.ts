import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

const FAVORITE_PRODUCT_ID = 'prod-tomates'
const FAVORITE_PRODUCT_NAME = /tomates cherry ecológicos/i

test.describe('buyer favorites @smoke', () => {
  test('customer can save a favorite and open the favorites page without Decimal warnings', async ({ page }) => {
    const consoleWarnings: string[] = []

    page.on('console', msg => {
      const text = msg.text()
      if (
        (msg.type() === 'warning' || msg.type() === 'error') &&
        /Decimal|\$numberDecimal|serializ/i.test(text)
      ) {
        consoleWarnings.push(text)
      }
    })

    await loginAs(page, TEST_USERS.customer)

    const response = await page.request.post('/api/favoritos', {
      data: { productId: FAVORITE_PRODUCT_ID },
    })
    expect(response.ok()).toBeTruthy()

    await page.goto('/cuenta/favoritos')
    await expect(page.getByRole('heading', { name: /mis favoritos/i }).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(FAVORITE_PRODUCT_NAME).first()).toBeVisible({
      timeout: 10_000,
    })

    expect(consoleWarnings, `unexpected Decimal serialization warnings: ${consoleWarnings.join(' | ')}`).toEqual([])
  })
})

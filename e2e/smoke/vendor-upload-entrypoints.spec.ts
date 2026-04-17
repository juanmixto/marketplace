import { test, expect, devices } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

const SAMPLE_UPLOAD =
  'public/uploads/products/cmnuna4va0009drml8ht9ljzu/42c08652-9cd4-46d2-bcab-7e5cf66f3ea3.jpg'
const iPhone13 = devices['iPhone 13']

test.describe('vendor upload entrypoints desktop @smoke', () => {
  test('desktop product uploader exposes upload only and no camera capture input', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)
    await page.goto('/vendor/productos/nuevo')

    await expect(page.getByText('Arrastra tus imágenes aquí')).toBeVisible()
    await expect(page.getByText('Subir fotos')).toHaveCount(0)
    await expect(page.getByText('Hacer foto')).toHaveCount(0)
    await expect(page.locator('input[capture="environment"]')).toHaveCount(0)

    await page.locator('#product-image-upload').setInputFiles(SAMPLE_UPLOAD)
    await expect(page.getByText('5/6')).toBeVisible()
    await expect(page.getByRole('button', { name: /eliminar imagen/i })).toBeVisible()
  })

  test('desktop vendor profile keeps camera actions out of the form', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)
    await page.goto('/vendor/perfil')

    await expect(page.getByText('Subir foto')).toHaveCount(0)
    await expect(page.getByText('Hacer foto')).toHaveCount(0)
    await expect(page.locator('input[capture="environment"]')).toHaveCount(0)
  })
})

test.describe('vendor upload entrypoints mobile @smoke', () => {
  test.use({
    viewport: iPhone13.viewport,
    userAgent: iPhone13.userAgent,
    deviceScaleFactor: iPhone13.deviceScaleFactor,
    isMobile: iPhone13.isMobile,
    hasTouch: iPhone13.hasTouch,
  })

  test('mobile product uploader exposes library and camera paths', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)
    await page.goto('/vendor/productos/nuevo')

    await expect(page.getByRole('button', { name: /subir fotos/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /hacer foto/i })).toBeVisible()
    await expect(page.locator('input[capture="environment"]')).toHaveCount(1)

    await page.locator('input[capture="environment"]').setInputFiles(SAMPLE_UPLOAD)
    await expect(page.getByText('5/6')).toBeVisible()
    await expect(page.getByRole('button', { name: /eliminar imagen/i })).toBeVisible()
  })

  test('mobile vendor profile exposes separate photo and camera actions for cover and logo', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)
    await page.goto('/vendor/perfil')

    await expect(page.getByText('Portada del escaparate', { exact: true })).toBeVisible()
    await expect(page.getByText('Foto de perfil', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /subir foto/i })).toHaveCount(2)
    await expect(page.getByRole('button', { name: /hacer foto/i })).toHaveCount(2)
    await expect(page.locator('input[capture="environment"]')).toHaveCount(2)
  })
})

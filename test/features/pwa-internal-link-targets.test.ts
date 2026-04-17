import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression tests for the "link opens in browser instead of installed PWA"
 * bug. Internal same-origin links in vendor/buyer-portal components MUST
 * NOT use `target="_blank"` — it overrides the manifest's
 * `launch_handler` and spawns a new browser window.
 *
 * External URLs (carrier tracking, shipping labels) legitimately keep
 * `target="_blank"`, so this suite explicitly allow-lists them.
 *
 * Admin components are NOT covered here: admin runs on a separate host
 * in production (ADMIN_HOST isolation), so cross-origin navigations
 * legitimately open in a new window.
 */

const INTERNAL_NAV_FILES = [
  'src/components/vendor/VendorSidebar.tsx',
  'src/components/vendor/VendorHeader.tsx',
  'src/components/vendor/ProductActions.tsx',
]

for (const rel of INTERNAL_NAV_FILES) {
  test(`${rel}: no target="_blank" on internal navigation`, () => {
    const content = readFileSync(join(process.cwd(), rel), 'utf-8')
    const blankCount = (content.match(/target="_blank"/g) ?? []).length
    assert.equal(
      blankCount,
      0,
      `Found target="_blank" in ${rel}. Internal same-origin links ` +
        `must navigate within the installed PWA window. If this is a ` +
        `legitimate external URL (tracking, label), move the link or ` +
        `add it to INTERNAL_NAV_FILES exceptions.`
    )
  })
}

// Explicit allow-list: these files have external-URL targets that must
// keep target="_blank" (third-party trackers, PDF labels).
test('FulfillmentActions keeps target="_blank" for external tracking/label URLs', () => {
  const content = readFileSync(
    join(process.cwd(), 'src/components/vendor/FulfillmentActions.tsx'),
    'utf-8'
  )
  // Should have at least one target="_blank" for external URLs.
  const blankMatches = content.match(/target="_blank"/g) ?? []
  assert.ok(
    blankMatches.length >= 2,
    'FulfillmentActions must keep target="_blank" for labelUrl and trackingUrl'
  )
})

test('OrderDetailClient keeps target="_blank" for external tracking URL', () => {
  const content = readFileSync(
    join(process.cwd(), 'src/app/(buyer)/cuenta/pedidos/[id]/OrderDetailClient.tsx'),
    'utf-8'
  )
  assert.ok(
    content.includes('target="_blank"'),
    'OrderDetailClient must keep target="_blank" for the carrier tracking URL'
  )
})

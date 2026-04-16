import test from 'node:test'
import assert from 'node:assert/strict'
import manifest from '@/app/manifest'

/**
 * Regression tests for the PWA manifest behavior that keeps navigations
 * inside the installed app window on desktop Chromium (Chrome, Edge,
 * Brave). Removing any of these fields re-introduces the "every link
 * opens in the browser" bug.
 */

test('manifest: launch_handler uses navigate-existing client mode', () => {
  const m = manifest()
  const launch = (m as unknown as { launch_handler?: { client_mode?: string } }).launch_handler
  assert.ok(launch, 'manifest must declare launch_handler')
  assert.equal(launch?.client_mode, 'navigate-existing')
})

test('manifest: display_override includes standalone + minimal-ui fallback', () => {
  const m = manifest()
  const override = (m as unknown as { display_override?: string[] }).display_override
  assert.ok(Array.isArray(override), 'display_override must be an array')
  assert.ok(override!.includes('standalone'))
  assert.ok(override!.includes('minimal-ui'))
})

test('manifest: primary display stays standalone', () => {
  const m = manifest()
  assert.equal(m.display, 'standalone')
})

test('manifest: scope covers the entire origin', () => {
  const m = manifest()
  assert.equal(m.scope, '/')
})

test('manifest: id is stable even when start_url changes', () => {
  const m = manifest()
  assert.equal(m.id, '/')
})

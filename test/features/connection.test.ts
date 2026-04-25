import test from 'node:test'
import assert from 'node:assert/strict'

// Stub navigator.connection per-test by writing onto globalThis.
// The lib reads navigator at call time, not at import time, so this works.
const setConnection = (info: { effectiveType?: string; saveData?: boolean } | undefined) => {
  if (typeof globalThis.navigator === 'undefined') {
    ;(globalThis as unknown as { navigator: unknown }).navigator = {}
  }
  ;(globalThis.navigator as unknown as { connection?: unknown }).connection = info
}

import {
  getEffectiveType,
  isSaveDataEnabled,
  isSlowConnection,
  getAdaptiveImageQuality,
} from '@/lib/connection'

test('getEffectiveType returns the value when API present', () => {
  setConnection({ effectiveType: '3g' })
  assert.equal(getEffectiveType(), '3g')
})

test('getEffectiveType returns undefined when API absent', () => {
  setConnection(undefined)
  assert.equal(getEffectiveType(), undefined)
})

test('isSaveDataEnabled true / false / undefined', () => {
  setConnection({ saveData: true })
  assert.equal(isSaveDataEnabled(), true)
  setConnection({ saveData: false })
  assert.equal(isSaveDataEnabled(), false)
  setConnection(undefined)
  assert.equal(isSaveDataEnabled(), false)
})

test('isSlowConnection only true on 2g / slow-2g', () => {
  setConnection({ effectiveType: '4g' })
  assert.equal(isSlowConnection(), false)
  setConnection({ effectiveType: '3g' })
  assert.equal(isSlowConnection(), false)
  setConnection({ effectiveType: '2g' })
  assert.equal(isSlowConnection(), true)
  setConnection({ effectiveType: 'slow-2g' })
  assert.equal(isSlowConnection(), true)
  setConnection(undefined)
  assert.equal(isSlowConnection(), false)
})

test('getAdaptiveImageQuality matches the policy table', () => {
  setConnection({ saveData: true })
  assert.equal(getAdaptiveImageQuality(), 50)

  setConnection({ effectiveType: 'slow-2g' })
  assert.equal(getAdaptiveImageQuality(), 50)

  setConnection({ effectiveType: '2g' })
  assert.equal(getAdaptiveImageQuality(), 50)

  setConnection({ effectiveType: '3g' })
  assert.equal(getAdaptiveImageQuality(), 70)

  setConnection({ effectiveType: '4g' })
  assert.equal(getAdaptiveImageQuality(), 85)

  setConnection(undefined)
  assert.equal(getAdaptiveImageQuality(), 85)
})

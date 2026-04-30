import test from 'node:test'
import assert from 'node:assert/strict'

import { transformSizesWithDownscale } from '@/lib/image-sizes'

test('downscale 1.0 is a no-op', () => {
  assert.equal(transformSizesWithDownscale('100vw', 1.0), '100vw')
  assert.equal(
    transformSizesWithDownscale('(max-width: 640px) 50vw, 25vw', 1.0),
    '(max-width: 640px) 50vw, 25vw',
  )
})

test('downscale > 1 is rejected (treat as no-op, never upscale)', () => {
  assert.equal(transformSizesWithDownscale('100vw', 1.5), '100vw')
})

test('downscale 0.66 reduces vw values rounded to nearest int', () => {
  // 50 * 0.66 = 33, 25 * 0.66 = 16.5 → 17
  assert.equal(
    transformSizesWithDownscale('(max-width: 640px) 50vw, 25vw', 0.66),
    '(max-width: 640px) 33vw, 17vw',
  )
})

test('downscale 0.5 halves vw values', () => {
  assert.equal(transformSizesWithDownscale('100vw', 0.5), '50vw')
  assert.equal(transformSizesWithDownscale('80vw', 0.5), '40vw')
})

test('downscale applies to fixed px values', () => {
  assert.equal(transformSizesWithDownscale('80px', 0.5), '40px')
  assert.equal(transformSizesWithDownscale('80px', 0.66), '53px')
})

test('mixed vw and px in one declaration', () => {
  assert.equal(
    transformSizesWithDownscale('(max-width: 768px) 100vw, 600px', 0.5),
    '(max-width: 768px) 50vw, 300px',
  )
})

test('zero values are preserved', () => {
  assert.equal(transformSizesWithDownscale('0vw', 0.5), '0vw')
  assert.equal(transformSizesWithDownscale('0px', 0.5), '0px')
})

test('values that round below 1 are floored at 1 (never 0)', () => {
  // 1 * 0.5 = 0.5 → would round to 0; clamped to 1.
  assert.equal(transformSizesWithDownscale('1vw', 0.5), '1vw')
  assert.equal(transformSizesWithDownscale('1px', 0.5), '1px')
})

test('empty string round-trips unchanged', () => {
  assert.equal(transformSizesWithDownscale('', 0.5), '')
})

test('non-finite or non-positive factor is a no-op', () => {
  assert.equal(transformSizesWithDownscale('100vw', Number.NaN), '100vw')
  assert.equal(transformSizesWithDownscale('100vw', 0), '100vw')
  assert.equal(transformSizesWithDownscale('100vw', -0.5), '100vw')
})

test('non-vw, non-px tokens pass through verbatim', () => {
  // We don't try to parse calc()/em/%; only the numeric vw/px get scaled.
  assert.equal(
    transformSizesWithDownscale('calc(100vw - 32px)', 0.5),
    'calc(50vw - 16px)',
  )
  assert.equal(transformSizesWithDownscale('50%', 0.5), '50%')
  assert.equal(transformSizesWithDownscale('10em', 0.5), '10em')
})

test('decimal vw inputs are rounded after scaling', () => {
  // 33.33 * 0.66 = 21.99 → 22
  assert.equal(transformSizesWithDownscale('33.33vw', 0.66), '22vw')
})

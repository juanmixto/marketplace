import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getDefaultPostalCodeForZone,
  resolveShippingZoneFromHeaders,
} from '@/domains/shipping/zone-default'

function fakeHeaders(values: Record<string, string>) {
  return {
    get(name: string): string | null {
      return values[name.toLowerCase()] ?? null
    },
  }
}

test('resolveShippingZoneFromHeaders maps each ES region code to its zone', () => {
  assert.equal(
    resolveShippingZoneFromHeaders(fakeHeaders({ 'cf-region-code': 'ES-IB' })),
    'baleares',
  )
  assert.equal(
    resolveShippingZoneFromHeaders(fakeHeaders({ 'cf-region-code': 'ES-CN' })),
    'canarias',
  )
  assert.equal(
    resolveShippingZoneFromHeaders(fakeHeaders({ 'cf-region-code': 'ES-CE' })),
    'ceuta',
  )
  assert.equal(
    resolveShippingZoneFromHeaders(fakeHeaders({ 'cf-region-code': 'ES-ML' })),
    'melilla',
  )
})

test('resolveShippingZoneFromHeaders is case-insensitive on the region code', () => {
  assert.equal(
    resolveShippingZoneFromHeaders(fakeHeaders({ 'cf-region-code': 'es-cn' })),
    'canarias',
  )
})

test('resolveShippingZoneFromHeaders falls back to peninsula for any unmapped region', () => {
  // ES-MD (Madrid), ES-CT (Catalonia), ES-AN (Andalucía) — all peninsula.
  assert.equal(
    resolveShippingZoneFromHeaders(fakeHeaders({ 'cf-region-code': 'ES-MD' })),
    'peninsula',
  )
  assert.equal(
    resolveShippingZoneFromHeaders(fakeHeaders({ 'cf-region-code': 'ES-CT' })),
    'peninsula',
  )
})

test('resolveShippingZoneFromHeaders falls back to peninsula when cf-region-code is missing', () => {
  // Dev, non-CF traffic, or CF zone without "Add visitor location
  // headers" enabled — must not break the band, just default cleanly.
  assert.equal(resolveShippingZoneFromHeaders(fakeHeaders({})), 'peninsula')
})

test('getDefaultPostalCodeForZone returns a representative CP for each zone', () => {
  // Each CP must satisfy the contract used by `findShippingZone` in
  // shipping/shared.ts: the first two digits map to a Spanish province
  // that lives in the corresponding zone.
  assert.equal(getDefaultPostalCodeForZone('peninsula'), '28001') // Madrid
  assert.equal(getDefaultPostalCodeForZone('baleares'), '07001') // Illes Balears
  assert.equal(getDefaultPostalCodeForZone('canarias'), '35001') // Las Palmas
  assert.equal(getDefaultPostalCodeForZone('ceuta'), '51001')
  assert.equal(getDefaultPostalCodeForZone('melilla'), '52001')
})

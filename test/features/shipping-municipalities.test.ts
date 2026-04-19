import test from 'node:test'
import assert from 'node:assert/strict'
import {
  _resetMunicipalityCache,
  findMunicipality,
  searchMunicipalities,
} from '@/domains/shipping/municipalities'

test.beforeEach(() => {
  _resetMunicipalityCache()
})

test('searchMunicipalities filters by province name (accent/case-insensitive)', async () => {
  const results = await searchMunicipalities({ query: 'valdep', province: 'Ciudad Real', limit: 5 })
  assert.ok(results.some(r => r.name.toLowerCase().startsWith('valdep')))
  assert.ok(results.every(r => r.prefix === '13'))
})

test('searchMunicipalities filters by 2-digit prefix', async () => {
  const results = await searchMunicipalities({ query: 'madr', province: '28', limit: 5 })
  assert.ok(results.some(r => r.name === 'Madrid'))
  assert.ok(results.every(r => r.prefix === '28'))
})

test('searchMunicipalities ranks prefix matches before substring matches', async () => {
  const results = await searchMunicipalities({ query: 'val', province: 'Valencia', limit: 20 })
  // Names that start with "val" should come before ones that only contain "val".
  const firstContains = results.findIndex(r => !r.name.toLowerCase().startsWith('val'))
  const lastStarts = results
    .map((r, i) => ({ name: r.name, i }))
    .filter(x => x.name.toLowerCase().startsWith('val'))
    .at(-1)
  if (firstContains >= 0 && lastStarts) {
    assert.ok(firstContains > lastStarts.i, 'starts should come before contains')
  }
})

test('searchMunicipalities returns empty for unknown province', async () => {
  const results = await searchMunicipalities({ query: 'madrid', province: '99' })
  assert.deepEqual(results, [])
})

test('findMunicipality matches accent- and case-insensitively', async () => {
  const match = await findMunicipality('Jaén', 'JAEN')
  assert.ok(match, 'expected a municipality match for Jaén/JAEN')
  assert.equal(match?.prefix, '23')
  assert.ok(match?.postalCodes.some(cp => cp.startsWith('23')))
})

test('findMunicipality returns null for unknown municipality', async () => {
  const match = await findMunicipality('Madrid', 'Atlantis')
  assert.equal(match, null)
})

test('searchMunicipalities respects limit', async () => {
  const results = await searchMunicipalities({ query: '', province: '28', limit: 3 })
  assert.equal(results.length, 3)
})

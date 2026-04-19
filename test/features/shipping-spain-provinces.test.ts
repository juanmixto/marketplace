import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPAIN_PROVINCES,
  SPAIN_PROVINCE_BY_PREFIX,
  getPrefixForProvince,
  isPlausiblePhone,
  isValidPhone,
  normalizePhone,
  normalizeProvinceName,
  postalCodeMatchesProvince,
} from '@/domains/shipping/spain-provinces'

test('SPAIN_PROVINCE_BY_PREFIX has the 52 Spanish provinces', () => {
  assert.equal(Object.keys(SPAIN_PROVINCE_BY_PREFIX).length, 52)
})

test('SPAIN_PROVINCES is sorted alphabetically in Spanish locale', () => {
  const names = SPAIN_PROVINCES.map(p => p.name)
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'es'))
  assert.deepEqual(names, sorted)
})

test('getPrefixForProvince matches exact names', () => {
  assert.equal(getPrefixForProvince('Madrid'), '28')
  assert.equal(getPrefixForProvince('Barcelona'), '08')
  assert.equal(getPrefixForProvince('Sevilla'), '41')
})

test('getPrefixForProvince is accent-insensitive and case-insensitive', () => {
  assert.equal(getPrefixForProvince('jaen'), '23')
  assert.equal(getPrefixForProvince('JAÉN'), '23')
  assert.equal(getPrefixForProvince('Cadiz'), '11')
  assert.equal(getPrefixForProvince('CÓRDOBA'), '14')
})

test('getPrefixForProvince returns null for unknown', () => {
  assert.equal(getPrefixForProvince('Atlantis'), null)
})

test('normalizeProvinceName strips accents, spaces and case', () => {
  assert.equal(normalizeProvinceName('  Jaén  '), 'jaen')
  assert.equal(normalizeProvinceName('ILLES BALEARS'), 'illes balears')
})

test('postalCodeMatchesProvince happy path', () => {
  assert.equal(postalCodeMatchesProvince('28001', 'Madrid'), true)
  assert.equal(postalCodeMatchesProvince('08001', 'Barcelona'), true)
  assert.equal(postalCodeMatchesProvince('23001', 'Jaén'), true)
})

test('postalCodeMatchesProvince rejects mismatched prefixes', () => {
  assert.equal(postalCodeMatchesProvince('08001', 'Madrid'), false)
  assert.equal(postalCodeMatchesProvince('41001', 'Madrid'), false)
})

test('postalCodeMatchesProvince rejects non-5-digit codes', () => {
  assert.equal(postalCodeMatchesProvince('280', 'Madrid'), false)
  assert.equal(postalCodeMatchesProvince('2800A', 'Madrid'), false)
})

test('postalCodeMatchesProvince returns true for empty postal (validated elsewhere)', () => {
  assert.equal(postalCodeMatchesProvince('', 'Madrid'), true)
})

test('postalCodeMatchesProvince returns false for unknown province', () => {
  assert.equal(postalCodeMatchesProvince('28001', 'Narnia'), false)
})

test('isValidPhone accepts Spanish-style phones with spaces and plus', () => {
  assert.equal(isValidPhone('+34 600 000 000'), true)
  assert.equal(isValidPhone('600000000'), true)
  assert.equal(isValidPhone('(34) 600-000-000'), true)
})

test('isValidPhone rejects letters', () => {
  assert.equal(isValidPhone('600000ABC'), false)
  assert.equal(isValidPhone('call-me'), false)
})

test('isValidPhone rejects too few or too many digits', () => {
  assert.equal(isValidPhone('12345'), false) // 5 digits < 9
  assert.equal(isValidPhone('1'.repeat(20)), false) // 20 digits > 15
})

test('isValidPhone rejects empty string', () => {
  assert.equal(isValidPhone(''), false)
})

test('isPlausiblePhone accepts 7+ digits with loose formatting', () => {
  assert.equal(isPlausiblePhone('600 000'), false) // 6 digits
  assert.equal(isPlausiblePhone('6000000'), true) // 7 digits
  assert.equal(isPlausiblePhone('+34 600 000 000'), true)
  assert.equal(isPlausiblePhone('(600) 000-0000'), true)
})

test('isPlausiblePhone still rejects letters and overflow', () => {
  assert.equal(isPlausiblePhone('call-me'), false)
  assert.equal(isPlausiblePhone('1'.repeat(16)), false)
})

test('normalizePhone strips whitespace and punctuation, keeps leading plus', () => {
  assert.equal(normalizePhone('+34 600-000 000'), '+34600000000')
  assert.equal(normalizePhone(' 600 000 000 '), '600000000')
  assert.equal(normalizePhone(''), '')
})

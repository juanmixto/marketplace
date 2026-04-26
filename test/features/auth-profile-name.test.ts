import test from 'node:test'
import assert from 'node:assert/strict'
import { splitProfileName } from '@/lib/auth-profile-name'

test('two-token name → first + last', () => {
  assert.deepEqual(splitProfileName('Juan Ortega', 'juan@x.com'), {
    firstName: 'Juan',
    lastName: 'Ortega',
  })
})

test('three-token name → first + rest joined as last', () => {
  assert.deepEqual(splitProfileName('Juan María Ortega', 'j@x.com'), {
    firstName: 'Juan',
    lastName: 'María Ortega',
  })
})

test('single-token name → first only, empty last', () => {
  assert.deepEqual(splitProfileName('Cher', 'cher@x.com'), {
    firstName: 'Cher',
    lastName: '',
  })
})

test('empty name with email falls back to local-part', () => {
  assert.deepEqual(splitProfileName('', 'juan.ortega@x.com'), {
    firstName: 'juan.ortega',
    lastName: '',
  })
})

test('null name with email falls back to local-part', () => {
  assert.deepEqual(splitProfileName(null, 'sole@x.com'), {
    firstName: 'sole',
    lastName: '',
  })
})

test('whitespace-only name with email falls back to local-part', () => {
  assert.deepEqual(splitProfileName('   ', 'juan@x.com'), {
    firstName: 'juan',
    lastName: '',
  })
})

test('no name and no email → "User" / ""', () => {
  assert.deepEqual(splitProfileName(null, null), {
    firstName: 'User',
    lastName: '',
  })
})

test('empty email local-part falls through to "User"', () => {
  // "@x.com" has no local-part; should NOT produce empty firstName.
  assert.deepEqual(splitProfileName('', '@x.com'), {
    firstName: 'User',
    lastName: '',
  })
})

test('extra internal whitespace is collapsed', () => {
  assert.deepEqual(splitProfileName('Juan    Ortega   Saceda', 'j@x.com'), {
    firstName: 'Juan',
    lastName: 'Ortega Saceda',
  })
})

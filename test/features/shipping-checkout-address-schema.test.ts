import test from 'node:test'
import assert from 'node:assert/strict'
import { addressSchema } from '@/domains/orders/checkout'

const validBase = {
  firstName: 'Ana',
  lastName: 'Comprador',
  line1: 'Calle Mayor 1',
  line2: undefined,
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
  phone: '+34 600 000 000',
}

test('addressSchema accepts a fully valid Spanish address', () => {
  const result = addressSchema.safeParse(validBase)
  assert.equal(result.success, true)
})

test('addressSchema accepts no phone (optional)', () => {
  const result = addressSchema.safeParse({ ...validBase, phone: undefined })
  assert.equal(result.success, true)
})

test('addressSchema rejects an unknown province', () => {
  const result = addressSchema.safeParse({ ...validBase, province: 'Atlantis' })
  assert.equal(result.success, false)
  if (!result.success) {
    const issue = result.error.issues.find(i => i.path[0] === 'province')
    assert.ok(issue, 'expected a province issue')
  }
})

test('addressSchema rejects postal code that does not match province', () => {
  const result = addressSchema.safeParse({
    ...validBase,
    province: 'Madrid',
    postalCode: '08001',
  })
  assert.equal(result.success, false)
  if (!result.success) {
    const issue = result.error.issues.find(i => i.path[0] === 'postalCode')
    assert.ok(issue, 'expected a postalCode issue')
    assert.match(String(issue!.message), /28/)
  }
})

test('addressSchema rejects phone with letters', () => {
  const result = addressSchema.safeParse({ ...validBase, phone: '600abc1234' })
  assert.equal(result.success, false)
})

test('addressSchema rejects a postal code that is not 5 digits', () => {
  const result = addressSchema.safeParse({ ...validBase, postalCode: '280' })
  assert.equal(result.success, false)
})

test('addressSchema trims whitespace in required fields', () => {
  const result = addressSchema.safeParse({
    ...validBase,
    firstName: '  Ana  ',
    lastName: '  Comprador  ',
    line1: '  Calle Mayor 1  ',
    city: '  Madrid  ',
  })
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.firstName, 'Ana')
    assert.equal(result.data.city, 'Madrid')
  }
})

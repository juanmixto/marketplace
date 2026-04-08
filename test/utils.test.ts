import test from 'node:test'
import assert from 'node:assert/strict'
import { cn, formatDate, formatPrice, generateOrderNumber, slugify, truncate } from '@/lib/utils'

test('cn merges conditional tailwind classes predictably', () => {
  const className = cn('rounded-md bg-white', false && 'hidden', 'bg-slate-100')

  assert.equal(className, 'rounded-md bg-slate-100')
})

test('formatPrice formats euro amounts for es-ES locale', () => {
  assert.equal(formatPrice(12.5), '12,50 €')
})

test('formatDate formats dates with a spanish locale default', () => {
  assert.equal(formatDate('2026-04-08T00:00:00.000Z'), '8 abr 2026')
})

test('slugify strips accents and punctuation', () => {
  assert.equal(slugify('Aceite Virgen Extra, edición 2026!'), 'aceite-virgen-extra-edicion-2026')
})

test('generateOrderNumber returns a marketplace-prefixed id with current year', () => {
  const orderNumber = generateOrderNumber()

  assert.match(orderNumber, /^MP-\d{4}-\d{6}$/)
  assert.equal(orderNumber.startsWith(`MP-${new Date().getFullYear()}-`), true)
})

test('truncate returns the original text when it already fits', () => {
  assert.equal(truncate('corto', 10), 'corto')
})

test('truncate appends ellipsis when text exceeds the maximum length', () => {
  assert.equal(truncate('mercado local sostenible', 8), 'mercado …')
})

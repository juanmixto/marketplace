import test from 'node:test'
import assert from 'node:assert/strict'
import { formatRelativeTime } from '@/lib/format-relative-time'

const NOW = new Date('2026-04-25T12:00:00Z').getTime()

test('formats days ago in Spanish without suffix', () => {
  const past = new Date('2026-04-22T12:00:00Z')
  const result = formatRelativeTime(past, { locale: 'es', now: NOW })
  // 3 días ago → "hace 3 días" with suffix; without suffix expect "3 días"
  assert.match(result, /3 días/)
  assert.doesNotMatch(result, /hace/)
})

test('formats days ago in English without suffix', () => {
  const past = new Date('2026-04-22T12:00:00Z')
  const result = formatRelativeTime(past, { locale: 'en', now: NOW })
  assert.match(result, /3 days/)
  assert.doesNotMatch(result, /ago/)
})

test('formats months ago when older than 30 days', () => {
  const past = new Date('2025-12-01T12:00:00Z')
  const result = formatRelativeTime(past, { locale: 'es', now: NOW })
  // ~5 months
  assert.match(result, /\d+ mes/)
})

test('formats hours ago for recent dates', () => {
  const past = new Date('2026-04-25T09:00:00Z') // 3h ago
  const result = formatRelativeTime(past, { locale: 'es', now: NOW })
  assert.match(result, /3 horas/)
})

test('addSuffix:true returns full localized string', () => {
  const past = new Date('2026-04-22T12:00:00Z')
  const result = formatRelativeTime(past, { locale: 'es', addSuffix: true, now: NOW })
  assert.match(result, /hace 3 días/)
})

test('handles "ayer" / "yesterday" via numeric:auto for 1 day', () => {
  const past = new Date('2026-04-24T12:00:00Z') // exactly 1 day ago
  const resultEs = formatRelativeTime(past, { locale: 'es', addSuffix: true, now: NOW })
  // numeric:'auto' produces "ayer" in Spanish
  assert.ok(/ayer|hace 1 día/.test(resultEs))
})

test('accepts string and number inputs', () => {
  const past = new Date('2026-04-22T12:00:00Z')
  const fromString = formatRelativeTime(past.toISOString(), { locale: 'es', now: NOW })
  const fromNumber = formatRelativeTime(past.getTime(), { locale: 'es', now: NOW })
  assert.equal(fromString, fromNumber)
})

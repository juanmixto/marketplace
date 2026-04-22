import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMadridDate } from '@/lib/utils'

test('formatMadridDate applies Europe/Madrid DST offset for summer timestamps', () => {
  const formatted = formatMadridDate('2026-06-15T12:00:00.000Z', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  assert.match(formatted, /14:00/)
})

test('formatMadridDate keeps Madrid local time for winter timestamps', () => {
  const formatted = formatMadridDate('2026-01-15T12:00:00.000Z', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  assert.match(formatted, /13:00/)
})
